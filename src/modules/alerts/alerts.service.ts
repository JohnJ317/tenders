import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { EmailService } from './email.service';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /** Crée une alerte NEW_MATCH si pas déjà existante pour ce couple */
  async createNewMatchAlert(cabinetId: string, scrapedTenderId: string) {
    // Idempotent : skip si déjà existe
    const existing = await this.prisma.alert.findFirst({
      where: { cabinetId, scrapedTenderId, type: 'NEW_MATCH' },
    });
    if (existing) return existing;

    const scraped = await this.prisma.scrapedTender.findUnique({
      where: { id: scrapedTenderId },
    });
    if (!scraped) return null;

    const alert = await this.prisma.alert.create({
      data: {
        cabinetId,
        type: 'NEW_MATCH',
        title: scraped.isEoi
          ? `Nouvel AMI pertinent : ${scraped.title.slice(0, 100)}`
          : `Nouvel AO pertinent : ${scraped.title.slice(0, 100)}`,
        message: `${scraped.source} · ${scraped.country ?? 'international'}${
          scraped.submissionDeadline
            ? ` · Deadline ${new Date(scraped.submissionDeadline).toLocaleDateString('fr-FR')}`
            : ''
        }`,
        scrapedTenderId,
      },
    });

    // Envoi email (async, n'empêche pas la création)
    this.email.sendNewMatchAlert(cabinetId, alert.id).catch((e) =>
      this.logger.warn(`Email failed for alert ${alert.id}: ${e.message}`),
    );

    return alert;
  }

  // ----- API pour le front -----

  async listForCabinet(filter?: 'unread' | 'all') {
    const cabinetId = TenantContext.tenantId();
    const where: any = { cabinetId, dismissedAt: null };
    if (filter === 'unread') where.readAt = null;

    return this.prisma.alert.findMany({
      where,
      include: {
        scrapedTender: {
          select: {
            id: true,
            source: true,
            title: true,
            country: true,
            submissionDeadline: true,
            sourceUrl: true,
            isEoi: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async unreadCount() {
    const cabinetId = TenantContext.tenantId();
    return this.prisma.alert.count({
      where: { cabinetId, readAt: null, dismissedAt: null },
    });
  }

  async markRead(id: string) {
    const cabinetId = TenantContext.tenantId();
    return this.prisma.alert.updateMany({
      where: { id, cabinetId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead() {
    const cabinetId = TenantContext.tenantId();
    return this.prisma.alert.updateMany({
      where: { cabinetId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async dismiss(id: string) {
    const cabinetId = TenantContext.tenantId();
    return this.prisma.alert.updateMany({
      where: { id, cabinetId },
      data: { dismissedAt: new Date() },
    });
  }
}
