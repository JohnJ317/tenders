import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import {
  UpdateTenderDocumentDto,
  UploadTenderDocumentDto,
} from './dto/tender-document.dto';

/** MIME types acceptés pour les documents d'AO */
const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/tiff',
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

@Injectable()
export class TenderDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(tenderId: string) {
    // On vérifie que l'AO appartient au cabinet courant
    await this.ensureTenderAccessible(tenderId);

    const docs = await this.prisma.tenderDocument.findMany({
      where: { tenderId },
      orderBy: { uploadedAt: 'desc' },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return docs.map((d) => ({
      ...d,
      sizeBytes: Number(d.sizeBytes), // BigInt → number pour JSON
    }));
  }

  async getById(id: string) {
    const doc = await this.findAccessible(id);
    const downloadUrl = await this.storage.getDownloadUrl(doc.s3Key, doc.filename);

    return {
      ...doc,
      sizeBytes: Number(doc.sizeBytes),
      downloadUrl,
    };
  }

  async upload(
    tenderId: string,
    file: Express.Multer.File,
    dto: UploadTenderDocumentDto,
    userId: string,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu (champ "file" attendu)');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `Fichier trop volumineux (${Math.round(file.size / 1024 / 1024)} MB). Limite: 50 MB`,
      );
    }
    if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Type de fichier non accepté: ${file.mimetype}. ` +
        `Acceptés: PDF, DOC(X), XLS(X), PPT(X), ZIP, CSV, TXT, JPG, PNG, TIFF`,
      );
    }

    await this.ensureTenderAccessible(tenderId);

    const tenantId = TenantContext.tenantId();
    const s3Key = this.storage.generateKey(tenantId, 'tenders', tenderId, file.originalname);

    // 1. Upload sur S3
    await this.storage.upload(s3Key, file.buffer, file.mimetype);

    // 2. Enregistrement en base
    try {
      const doc = await this.prisma.tenderDocument.create({
        data: {
          tenderId,
          category: dto.category,
          description: dto.description,
          filename: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: BigInt(file.size),
          s3Key,
          uploadedById: userId,
        },
        include: {
          uploadedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      return { ...doc, sizeBytes: Number(doc.sizeBytes) };
    } catch (err) {
      // Rollback : si l'insert en base a échoué, on supprime le fichier S3
      await this.storage.delete(s3Key).catch(() => undefined);
      throw err;
    }
  }

  async update(id: string, dto: UpdateTenderDocumentDto) {
    await this.findAccessible(id);
    const updated = await this.prisma.tenderDocument.update({
      where: { id },
      data: dto,
    });
    return { ...updated, sizeBytes: Number(updated.sizeBytes) };
  }

  async delete(id: string) {
    const doc = await this.findAccessible(id);
    // 1. Base d'abord (le CASCADE ne joue pas ici, on est direct sur la table)
    await this.prisma.tenderDocument.delete({ where: { id } });
    // 2. Puis S3 (si ça foire on a un orphelin S3, tolérable — on logge juste)
    await this.storage.delete(doc.s3Key).catch(() => undefined);
    return { deleted: true };
  }

  /** Vérifie que le tender appartient au cabinet courant */
  private async ensureTenderAccessible(tenderId: string) {
    const tender = await this.prisma.tender.findFirst({
      where: { id: tenderId, cabinetId: TenantContext.tenantId() },
      select: { id: true },
    });
    if (!tender) throw new NotFoundException('AO introuvable');
  }

  /** Vérifie que le document appartient à un tender du cabinet courant */
  private async findAccessible(docId: string) {
    const doc = await this.prisma.tenderDocument.findFirst({
      where: {
        id: docId,
        tender: { cabinetId: TenantContext.tenantId() },
      },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    if (!doc) throw new NotFoundException('Document introuvable');
    return doc;
  }
}
