import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { UpdateCabinetDto } from './dto/update-cabinet.dto';

@Injectable()
export class CabinetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async getCurrent() {
    const tenantId = TenantContext.tenantId();
    const cabinet = await this.prisma.cabinet.findUnique({
      where: { id: tenantId },
      include: {
        activities: { where: { isActive: true } },
        grilleHoraire: {
          where: { effectiveTo: null },
          orderBy: { grade: 'asc' },
        },
        _count: { select: { users: true } },
      },
    });

    if (!cabinet) {
      throw new NotFoundException('Cabinet introuvable');
    }
    return cabinet;
  }

  async update(dto: UpdateCabinetDto) {
    const tenantId = TenantContext.tenantId();
    return this.prisma.cabinet.update({
      where: { id: tenantId },
      data: dto,
    });
  }


  // ================================================================
  // Logo upload / delete
  // ================================================================

  /** Upload du logo cabinet (multipart) → MinIO → URL en DB */
  async uploadLogo(buffer: Buffer, mimeType: string, originalname: string) {
    const cabinetId = TenantContext.tenantId();

    // Validation côté serveur
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (!allowed.includes(mimeType)) {
      throw new BadRequestException('Format image non supporté (PNG, JPG, SVG, WEBP uniquement)');
    }
    if (buffer.length > 2 * 1024 * 1024) {
      throw new BadRequestException('Logo trop lourd (2 Mo max)');
    }

    // Récupère le cabinet pour supprimer l'ancien logo
    const cabinet = await this.prisma.cabinet.findUnique({
      where: { id: cabinetId },
      select: { id: true, logoUrl: true },
    });
    if (!cabinet) throw new NotFoundException('Cabinet introuvable');

    // Détermine extension
    const ext = mimeType === 'image/svg+xml' ? 'svg'
      : mimeType === 'image/webp' ? 'webp'
      : mimeType === 'image/png' ? 'png'
      : 'jpg';

    const key = `tenants/${cabinetId}/cabinet/logo-${Date.now()}.${ext}`;

    // Upload
    await this.storage.upload(key, buffer, mimeType);

    // Supprime l'ancien si existait
    if (cabinet.logoUrl) {
      try {
        // Extrait la clé de l'ancienne URL si format connu
        const oldKey = cabinet.logoUrl.split('?')[0].split('/').slice(-4).join('/');
        if (oldKey.startsWith('tenants/')) {
          await this.storage.delete(oldKey).catch(() => null);
        }
      } catch {}
    }

    // Génère l'URL signée (7j par défaut)
    const url = await this.storage.getDownloadUrl(key);

    // Update DB
    const updated = await this.prisma.cabinet.update({
      where: { id: cabinetId },
      data: { logoUrl: url },
      select: { id: true, logoUrl: true },
    });

    return updated;
  }

  /** Supprime le logo cabinet */
  async deleteLogo() {
    const cabinetId = TenantContext.tenantId();
    const cabinet = await this.prisma.cabinet.findUnique({
      where: { id: cabinetId },
      select: { id: true, logoUrl: true },
    });
    if (!cabinet) throw new NotFoundException('Cabinet introuvable');

    if (cabinet.logoUrl) {
      try {
        const oldKey = cabinet.logoUrl.split('?')[0].split('/').slice(-4).join('/');
        if (oldKey.startsWith('tenants/')) {
          await this.storage.delete(oldKey).catch(() => null);
        }
      } catch {}
    }

    return this.prisma.cabinet.update({
      where: { id: cabinetId },
      data: { logoUrl: null },
      select: { id: true, logoUrl: true },
    });
  }

  // ================================================================
  // Activities
  // ================================================================

  async addActivity(dto: { type: any; label: string }) {
    const cabinetId = TenantContext.tenantId();
    return this.prisma.activity.create({
      data: {
        cabinetId,
        type: dto.type,
        label: dto.label,
        isActive: true,
      },
    });
  }

  async removeActivity(activityId: string) {
    const cabinetId = TenantContext.tenantId();
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, cabinetId },
    });
    if (!activity) throw new NotFoundException('Activité introuvable');
    return this.prisma.activity.delete({ where: { id: activityId } });
  }

}