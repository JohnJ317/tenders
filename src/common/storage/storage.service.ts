import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

export interface UploadResult {
  s3Key: string;
  sizeBytes: number;
  mimeType: string;
  filename: string;
}

/**
 * Service de stockage S3-compatible (MinIO en dev, S3 ou Scaleway en prod).
 *
 * Conventions :
 *  - Les clés S3 sont préfixées par tenants/<cabinetId>/ pour la lisibilité
 *    et pour faciliter les clean-up par cabinet
 *  - Les fichiers uploadés ont un UUID dans la clé pour éviter les collisions
 *  - Les URLs de téléchargement sont pré-signées (expirent en 7j par défaut)
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: S3Client;
  private bucket!: string;
  private downloadExpires!: number;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const endpoint = this.config.getOrThrow<string>('S3_ENDPOINT');
    const region = this.config.get<string>('S3_REGION', 'us-east-1');
    const accessKeyId = this.config.getOrThrow<string>('S3_ACCESS_KEY');
    const secretAccessKey = this.config.getOrThrow<string>('S3_SECRET_KEY');
    const forcePathStyle = this.config.get<string>('S3_FORCE_PATH_STYLE') === 'true';

    this.bucket = this.config.getOrThrow<string>('S3_BUCKET');
    this.downloadExpires = Number(this.config.get('S3_DOWNLOAD_URL_EXPIRES', 604800));

    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle,
    });

    await this.ensureBucket();
  }

  private async ensureBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket "${this.bucket}" accessible`);
    } catch {
      // Bucket n'existe pas → on le crée (idempotent côté MinIO)
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Bucket "${this.bucket}" créé`);
      } catch (err) {
        this.logger.error(`Impossible de créer le bucket "${this.bucket}"`, err);
        throw err;
      }
    }
  }

  /**
   * Génère une clé S3 structurée et unique.
   * Ex: tenants/abc/tenders/xyz/01H7...-offre-technique.pdf
   */
  generateKey(tenantId: string, scope: 'tenders' | 'events', scopeId: string, filename: string): string {
    const safe = sanitizeFilename(filename);
    return `tenants/${tenantId}/${scope}/${scopeId}/${randomUUID()}-${safe}`;
  }

  async upload(key: string, body: Buffer, mimeType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: mimeType,
    }));
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }


  async downloadAsBuffer(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
    if (!res.Body) {
      throw new Error(`Objet S3 vide ou introuvable : ${key}`);
    }
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  /**
   * URL de téléchargement pré-signée, valide X secondes (7 jours par défaut).
   * Le client télécharge directement depuis MinIO/S3 sans passer par notre API.
   */
  async getDownloadUrl(key: string, filename?: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      // Force le navigateur à télécharger avec le bon nom de fichier
      ResponseContentDisposition: filename
        ? `attachment; filename="${sanitizeFilename(filename)}"`
        : undefined,
    });
    return getSignedUrl(this.client, command, { expiresIn: this.downloadExpires });
  }
}

/**
 * Nettoie un nom de fichier : ne garde que alphanum + . _ -, tronque à 150 chars.
 * Indispensable pour éviter l'injection dans les clés S3.
 */
function sanitizeFilename(name: string): string {
  const base = name
    .replace(/[^\w.\-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 150);
  return base || 'file';
}
