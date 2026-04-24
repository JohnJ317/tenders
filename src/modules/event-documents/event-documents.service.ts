import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import {
  UpdateEventDocumentDto,
  UploadEventDocumentDto,
} from './dto/event-document.dto';

const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/heic',
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

@Injectable()
export class EventDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(eventId: string) {
    await this.ensureEventAccessible(eventId);

    const docs = await this.prisma.eventDocument.findMany({
      where: { eventId },
      orderBy: { uploadedAt: 'desc' },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return docs.map((d) => ({ ...d, sizeBytes: Number(d.sizeBytes) }));
  }

  async getById(id: string) {
    const doc = await this.findAccessible(id);
    const downloadUrl = await this.storage.getDownloadUrl(doc.s3Key, doc.filename);
    return { ...doc, sizeBytes: Number(doc.sizeBytes), downloadUrl };
  }

  async upload(
    eventId: string,
    file: Express.Multer.File,
    dto: UploadEventDocumentDto,
    userId: string,
  ) {
    if (!file) throw new BadRequestException('Aucun fichier reçu');
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('Fichier trop volumineux (limite 50 MB)');
    }
    if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`Type de fichier non accepté: ${file.mimetype}`);
    }

    await this.ensureEventAccessible(eventId);

    const tenantId = TenantContext.tenantId();
    const s3Key = this.storage.generateKey(tenantId, 'events', eventId, file.originalname);

    await this.storage.upload(s3Key, file.buffer, file.mimetype);

    try {
      const doc = await this.prisma.eventDocument.create({
        data: {
          eventId,
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
      await this.storage.delete(s3Key).catch(() => undefined);
      throw err;
    }
  }

  async update(id: string, dto: UpdateEventDocumentDto) {
    await this.findAccessible(id);
    const updated = await this.prisma.eventDocument.update({ where: { id }, data: dto });
    return { ...updated, sizeBytes: Number(updated.sizeBytes) };
  }

  async delete(id: string) {
    const doc = await this.findAccessible(id);
    await this.prisma.eventDocument.delete({ where: { id } });
    await this.storage.delete(doc.s3Key).catch(() => undefined);
    return { deleted: true };
  }

  private async ensureEventAccessible(eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, cabinetId: TenantContext.tenantId() },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Manifestation introuvable');
  }

  private async findAccessible(docId: string) {
    const doc = await this.prisma.eventDocument.findFirst({
      where: {
        id: docId,
        event: { cabinetId: TenantContext.tenantId() },
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
