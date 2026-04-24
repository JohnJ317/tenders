import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClaudeUsageService } from '../../common/platform/claude-usage.service';

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usageService: ClaudeUsageService,
  ) {}

  // ==========================================================
  // CABINETS
  // ==========================================================

  /** Liste des cabinets avec stats agrégées (vue super_admin) */
  async listCabinets() {
    return this.prisma.withPlatformContext(async () => {
      const cabinets = await this.prisma.cabinet.findMany({
        where: { deletedAt: null } as any,
        include: {
          subscription: true,
          _count: {
            select: {
              users: true,
              tenders: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Stats par cabinet : AO won/lost/in_progress
      const results = await Promise.all(
        cabinets.map(async (c) => {
          const tenderStats = await this.prisma.tender.groupBy({
            by: ['stage'],
            where: { cabinetId: c.id },
            _count: true,
            _sum: { wonAmount: true },
          });

          const stats = {
            won: 0,
            lost: 0,
            inProgress: 0,
            wonAmountFcfa: 0,
          };
          for (const s of tenderStats) {
            if (s.stage === 'WON') {
              stats.won = s._count;
              stats.wonAmountFcfa = Number(s._sum.wonAmount ?? 0);
            } else if (s.stage === 'LOST') stats.lost = s._count;
            else if (s.stage !== 'CANCELLED') stats.inProgress += s._count;
          }

          // Claude usage ce mois
          const startOfMonth = new Date();
          startOfMonth.setDate(1);
          startOfMonth.setHours(0, 0, 0, 0);

          const usageAgg = await this.prisma.claudeUsageLog.aggregate({
            where: { cabinetId: c.id, createdAt: { gte: startOfMonth } },
            _count: true,
            _sum: { costFcfa: true },
          });

          return {
            id: c.id,
            name: c.name,
            country: c.country,
            status: c.status,
            createdAt: c.createdAt,
            platformCommissionRate: Number(c.platformCommissionRate ?? 0),
            logoUrl: (c as any).logoUrl ?? null,
            userCount: c._count.users,
            tenderCount: c._count.tenders,
            stats,
            subscription: c.subscription ? {
              status: c.subscription.status,
              nextBillingDate: c.subscription.nextBillingDate,
              lastPaidAt: c.subscription.lastPaidAt,
              monthlyAmountFcfa: Number(c.subscription.monthlyAmountFcfa),
            } : null,
            claudeMonth: {
              requests: usageAgg._count,
              costFcfa: Number(usageAgg._sum.costFcfa ?? 0),
            },
          };
        }),
      );

      return results;
    });
  }


  /** Liste UNIQUEMENT les cabinets archivés (pour section dédiée) */
  async listArchivedCabinets() {
    return this.prisma.withPlatformContext(async () => {
      const cabinets = await this.prisma.cabinet.findMany({
        where: { deletedAt: { not: null } } as any,
        select: {
          id: true,
          name: true,
          country: true,
          createdAt: true,
          deletedAt: true,
          _count: { select: { users: true, tenders: true } },
        } as any,
        orderBy: { deletedAt: 'desc' } as any,
      });
      return cabinets.map((c: any) => ({
        id: c.id,
        name: c.name,
        country: c.country,
        createdAt: c.createdAt,
        deletedAt: c.deletedAt,
        userCount: c._count.users,
        tenderCount: c._count.tenders,
      }));
    });
  }

  /** Détail d'un cabinet */
  async getCabinetDetail(cabinetId: string) {
    return this.prisma.withPlatformContext(async () => {
      const cabinet = await this.prisma.cabinet.findUnique({
        where: { id: cabinetId },
        include: {
          subscription: true,
          payments: { orderBy: { createdAt: 'desc' }, take: 20 },
          commissionInvoices: {
            orderBy: { createdAt: 'desc' },
            include: { tender: { select: { title: true, reference: true } } },
          },
          _count: { select: { users: true, tenders: true } },
        },
      });
      if (!cabinet) throw new NotFoundException('Cabinet introuvable');

      // Stats usage sur 90 derniers jours
      const from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const to = new Date();
      const usage = await this.usageService.getUsageStats(cabinetId, from, to);

      return {
        ...cabinet,
        platformCommissionRate: Number(cabinet.platformCommissionRate ?? 0),
        usage,
      };
    });
  }

  /** Met à jour le % de commission pour un cabinet */
  async updateCommissionRate(cabinetId: string, rate: number) {
    if (rate < 0 || rate > 1) {
      throw new BadRequestException('Rate doit être entre 0 et 1 (ex: 0.02 pour 2%)');
    }
    return this.prisma.withPlatformContext(() =>
      this.prisma.cabinet.update({
        where: { id: cabinetId },
        data: { platformCommissionRate: rate },
        select: { id: true, name: true, platformCommissionRate: true },
      }),
    );
  }

  /** Suspend / réactive un cabinet */
  async setCabinetStatus(cabinetId: string, status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED') {
    return this.prisma.withPlatformContext(() =>
      this.prisma.cabinet.update({
        where: { id: cabinetId },
        data: { status },
        select: { id: true, name: true, status: true },
      }),
    );
  }

  // ==========================================================
  // SUBSCRIPTIONS
  // ==========================================================

  async listSubscriptions() {
    return this.prisma.withPlatformContext(() =>
      this.prisma.subscription.findMany({
        include: {
          cabinet: { select: { id: true, name: true, country: true, status: true } },
        },
        orderBy: { nextBillingDate: 'asc' },
      }),
    );
  }

  async markPaymentReceived(params: {
    cabinetId: string;
    amountFcfa: number;
    reference?: string;
    waveTransactionId?: string;
    method?: 'WAVE' | 'BANK_TRANSFER' | 'MANUAL';
  }) {
    return this.prisma.withPlatformContext(async () => {
      const sub = await this.prisma.subscription.findUnique({
        where: { cabinetId: params.cabinetId },
      });
      if (!sub) throw new NotFoundException('Subscription introuvable');

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      // Crée le payment
      const payment = await this.prisma.payment.create({
        data: {
          cabinetId: params.cabinetId,
          subscriptionId: sub.id,
          amountFcfa: params.amountFcfa,
          method: params.method ?? 'WAVE',
          status: 'PAID',
          reference: params.reference,
          waveTransactionId: params.waveTransactionId,
          paidAt: now,
          periodStart: now,
          periodEnd,
        },
      });

      // Update subscription
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'ACTIVE',
          lastPaidAt: now,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          nextBillingDate: periodEnd,
        },
      });

      // Reactive le cabinet s'il était suspendu
      await this.prisma.cabinet.update({
        where: { id: params.cabinetId },
        data: { status: 'ACTIVE' },
      });

      return payment;
    });
  }

  /** Cron : suspend les cabinets impayés à J+gracePeriod */
  async runSuspensionCheck() {
    return this.prisma.withPlatformContext(async () => {
      const config = await this.prisma.platformConfig.findFirst();
      const gracePeriodDays = config?.suspensionGraceDays ?? 1;

      const threshold = new Date();
      threshold.setDate(threshold.getDate() - gracePeriodDays);

      const toSuspend = await this.prisma.subscription.findMany({
        where: {
          status: { in: ['ACTIVE', 'GRACE_PERIOD'] },
          nextBillingDate: { lt: threshold },
          cabinet: { deletedAt: null } as any,
        } as any,
        include: { cabinet: { include: { users: { where: { role: 'ADMIN_CABINET', isActive: true }, take: 1 } } } } as any,
      });

      const suspended: any[] = [];
      for (const subRaw of toSuspend as any[]) {
        const sub = subRaw as any;
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'SUSPENDED' },
        });
        await this.prisma.cabinet.update({
          where: { id: sub.cabinetId },
          data: { status: 'SUSPENDED' },
        });

        // Envoi email de notification au cabinet (idempotent)
        const admin = sub.cabinet?.users?.[0];
        if (admin?.email) {
          await this.sendSuspensionEmailIfNotSent(
            sub.id, sub.cabinetId, sub.cabinet.name, admin.email, sub.nextBillingDate,
          );
        }

        suspended.push({ cabinetId: sub.cabinetId, name: sub.cabinet.name });
        this.logger.warn(`Cabinet suspendu : ${sub.cabinet.name} (${sub.cabinetId})`);
      }

      return { suspended: suspended.length, details: suspended };
    });
  }

  /**
   * Envoie un email de rappel J-1 aux cabinets dont l'échéance arrive demain.
   * Idempotent : ne renvoie pas le même rappel pour la même échéance.
   */
  async runReminderCheck() {
    return this.prisma.withPlatformContext(async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const dayAfterTomorrow = new Date(tomorrow);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

      const toRemind = await this.prisma.subscription.findMany({
        where: {
          status: { in: ['ACTIVE', 'GRACE_PERIOD', 'TRIAL'] },
          nextBillingDate: { gte: tomorrow, lt: dayAfterTomorrow },
          cabinet: { deletedAt: null } as any,
        } as any,
        include: { cabinet: { include: { users: { where: { role: 'ADMIN_CABINET', isActive: true }, take: 1 } } } } as any,
      });

      const reminded: any[] = [];
      for (const subRaw of toRemind as any[]) {
        const sub = subRaw as any;
        const admin = sub.cabinet?.users?.[0];
        if (!admin?.email) continue;
        const ok = await this.sendReminderEmailIfNotSent(
          sub.id, sub.cabinetId, sub.cabinet.name, admin.email,
          sub.nextBillingDate, Number(sub.monthlyAmountFcfa),
        );
        if (ok) {
          reminded.push({ cabinetId: sub.cabinetId, name: sub.cabinet.name, email: admin.email });
          this.logger.log(`Rappel J-1 envoyé : ${sub.cabinet.name} → ${admin.email}`);
        }
      }
      return { reminded: reminded.length, details: reminded };
    });
  }

  // ==========================================================
  // EMAILS abonnement (rappel J-1 et notif suspension)
  // ==========================================================

  private async sendReminderEmailIfNotSent(
    subscriptionId: string,
    cabinetId: string,
    cabinetName: string,
    email: string,
    billingDate: Date | null,
    amountFcfa: number,
  ): Promise<boolean> {
    if (!billingDate) return false;
    const already = await (this.prisma as any).subscriptionNotificationSent.findUnique({
      where: {
        subscriptionId_notificationType_relatedBillingDate: {
          subscriptionId,
          notificationType: 'reminder_d_minus_1',
          relatedBillingDate: billingDate,
        },
      },
    }).catch(() => null);
    if (already) return false;

    const ok = await this.sendPlatformEmail({
      to: email,
      subject: `[TenderPro] Rappel : votre abonnement ${cabinetName} arrive à échéance demain`,
      html: this.buildReminderHtml(cabinetName, amountFcfa, billingDate),
    });

    if (ok) {
      await (this.prisma as any).subscriptionNotificationSent.create({
        data: {
          subscriptionId, cabinetId,
          notificationType: 'reminder_d_minus_1',
          relatedBillingDate: billingDate, emailTo: email,
        },
      }).catch((err: any) => this.logger.error(`Failed tracking reminder: ${err.message}`));
    }
    return ok;
  }

  private async sendSuspensionEmailIfNotSent(
    subscriptionId: string,
    cabinetId: string,
    cabinetName: string,
    email: string,
    billingDate: Date | null,
  ): Promise<boolean> {
    const already = await (this.prisma as any).subscriptionNotificationSent.findUnique({
      where: {
        subscriptionId_notificationType_relatedBillingDate: {
          subscriptionId,
          notificationType: 'suspension',
          relatedBillingDate: billingDate,
        },
      },
    }).catch(() => null);
    if (already) return false;

    const ok = await this.sendPlatformEmail({
      to: email,
      subject: `[TenderPro] Compte ${cabinetName} suspendu pour impayé`,
      html: this.buildSuspensionHtml(cabinetName),
    });

    if (ok) {
      await (this.prisma as any).subscriptionNotificationSent.create({
        data: {
          subscriptionId, cabinetId,
          notificationType: 'suspension',
          relatedBillingDate: billingDate ?? new Date(),
          emailTo: email,
        },
      }).catch((err: any) => this.logger.error(`Failed tracking suspension: ${err.message}`));
    }
    return ok;
  }

  private async sendPlatformEmail(d: { to: string; subject: string; html: string }): Promise<boolean> {
    try {
      const nodemailer = require('nodemailer');
      const host = process.env.SMTP_HOST;
      const port = Number(process.env.SMTP_PORT || '465');
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;
      if (!host || !user || !pass) {
        this.logger.warn(`SMTP non configuré — email vers ${d.to} non envoyé`);
        return false;
      }
      const transporter = nodemailer.createTransport({
        host, port, secure: port === 465, auth: { user, pass },
      });
      const fromName = process.env.SMTP_FROM_NAME || 'TenderPro';
      await transporter.sendMail({
        from: `"${fromName}" <${user}>`,
        to: d.to, subject: d.subject, html: d.html,
      });
      return true;
    } catch (err: any) {
      this.logger.error(`SMTP error vers ${d.to}: ${err.message}`);
      return false;
    }
  }

  private buildReminderHtml(cabinetName: string, amountFcfa: number, billingDate: Date): string {
    const fmtAmount = new Intl.NumberFormat('fr-FR').format(amountFcfa) + ' FCFA';
    const fmtDate = new Date(billingDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const appUrl = process.env.APP_URL || 'http://localhost:3001';
    return `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #0f172a;">
        <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 20px; border-radius: 8px 8px 0 0; color: white;">
          <h1 style="margin: 0; font-size: 20px;">⏰ Rappel : échéance demain</h1>
        </div>
        <div style="padding: 24px; background: white; border: 1px solid #e2e8f0; border-top: 0; border-radius: 0 0 8px 8px;">
          <p>Bonjour,</p>
          <p>L'abonnement TenderPro de votre cabinet <strong>${cabinetName}</strong> arrive à échéance le <strong>${fmtDate}</strong>.</p>
          <div style="background:#fef3c7;padding:16px;border-radius:8px;margin:20px 0;">
            <p style="margin:0;font-size:14px;color:#92400e;">Montant à régler</p>
            <p style="margin:4px 0 0 0;font-size:24px;font-weight:bold;color:#78350f;">${fmtAmount}</p>
          </div>
          <p>Pour éviter toute interruption de service, merci de procéder au paiement avant la date d'échéance.</p>
          <div style="margin: 28px 0;">
            <a href="${appUrl}/settings/billing" style="display:inline-block;background:#0d9488;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">Régler maintenant</a>
          </div>
          <p style="color:#64748b;font-size:13px;">Vous pouvez payer par Wave directement depuis votre espace facturation.</p>
        </div>
      </div>`;
  }

  private buildSuspensionHtml(cabinetName: string): string {
    const appUrl = process.env.APP_URL || 'http://localhost:3001';
    return `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #0f172a;">
        <div style="background: linear-gradient(135deg, #dc2626, #b91c1c); padding: 20px; border-radius: 8px 8px 0 0; color: white;">
          <h1 style="margin: 0; font-size: 20px;">⚠️ Compte suspendu</h1>
        </div>
        <div style="padding: 24px; background: white; border: 1px solid #e2e8f0; border-top: 0; border-radius: 0 0 8px 8px;">
          <p>Bonjour,</p>
          <p>L'accès au compte TenderPro de votre cabinet <strong>${cabinetName}</strong> a été <strong>suspendu</strong> pour impayé.</p>
          <p>Tous les utilisateurs de votre cabinet ne peuvent plus se connecter jusqu'à régularisation.</p>
          <div style="margin: 28px 0;">
            <a href="${appUrl}/settings/billing" style="display:inline-block;background:#dc2626;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">Régulariser maintenant</a>
          </div>
          <p style="color:#64748b;font-size:13px;">Une fois le paiement reçu et validé, votre accès sera réactivé sous 24h.</p>
          <p style="color:#64748b;font-size:13px;">Pour toute question, contactez le support TenderPro.</p>
        </div>
      </div>`;
  }


  // ==========================================================
  // COMMISSIONS
  // ==========================================================

  /** Crée une commission_invoice quand un tender passe à WON */
  async createCommissionForWonTender(tenderId: string, wonAmountFcfa: number) {
    return this.prisma.withPlatformContext(async () => {
      const tender = await this.prisma.tender.findUnique({
        where: { id: tenderId },
        include: { cabinet: true },
      });
      if (!tender) throw new NotFoundException('Tender introuvable');

      const rate = Number(tender.cabinet.platformCommissionRate ?? 0);
      if (rate === 0) {
        this.logger.log(`Pas de commission pour ${tender.cabinet.name} (rate=0)`);
        return null;
      }

      const commissionAmount = wonAmountFcfa * rate;

      return this.prisma.commissionInvoice.upsert({
        where: { tenderId },
        create: {
          cabinetId: tender.cabinetId,
          tenderId,
          wonAmountFcfa,
          commissionRate: rate,
          commissionAmountFcfa: commissionAmount,
          status: 'PENDING',
        },
        update: {
          wonAmountFcfa,
          commissionRate: rate,
          commissionAmountFcfa: commissionAmount,
        },
      });
    });
  }

  async listCommissions() {
    return this.prisma.withPlatformContext(() =>
      this.prisma.commissionInvoice.findMany({
        include: {
          cabinet: { select: { id: true, name: true } },
          tender: { select: { id: true, title: true, reference: true, wonAmount: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async markCommissionInvoiced(commissionId: string) {
    return this.prisma.withPlatformContext(() =>
      this.prisma.commissionInvoice.update({
        where: { id: commissionId },
        data: { status: 'INVOICED', invoicedAt: new Date() },
      }),
    );
  }

  async markCommissionPaid(commissionId: string) {
    return this.prisma.withPlatformContext(() =>
      this.prisma.commissionInvoice.update({
        where: { id: commissionId },
        data: { status: 'PAID', paidAt: new Date() },
      }),
    );
  }

  // ==========================================================
  // PLATFORM CONFIG
  // ==========================================================

  async getConfig() {
    return this.prisma.withPlatformContext(async () => {
      let config = await this.prisma.platformConfig.findFirst();
      if (!config) {
        config = await this.prisma.platformConfig.create({ data: {} });
      }
      return config;
    });
  }

  async updateConfig(data: {
    claudeInputPricePerMtokFcfa?: number;
    claudeOutputPricePerMtokFcfa?: number;
    monthlySubscriptionFcfa?: number;
    wavePaymentLink?: string;
    suspensionGraceDays?: number;
    defaultCommissionRate?: number;
  }) {
    return this.prisma.withPlatformContext(async () => {
      const existing = await this.prisma.platformConfig.findFirst();
      if (!existing) {
        return this.prisma.platformConfig.create({ data });
      }
      return this.prisma.platformConfig.update({
        where: { id: existing.id },
        data,
      });
    });
  }

  // ==========================================================
  // GLOBAL STATS (dashboard super_admin)
  // ==========================================================

  async getGlobalStats() {
    return this.prisma.withPlatformContext(async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [cabinetCount, activeCabinets, userCount, usageThisMonth, pendingCommissions] = await Promise.all([
        this.prisma.cabinet.count(),
        this.prisma.cabinet.count({ where: { status: 'ACTIVE' } }),
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.claudeUsageLog.aggregate({
          where: { createdAt: { gte: startOfMonth } },
          _count: true,
          _sum: { costFcfa: true },
        }),
        this.prisma.commissionInvoice.aggregate({
          where: { status: 'PENDING' },
          _count: true,
          _sum: { commissionAmountFcfa: true },
        }),
      ]);

      return {
        cabinetCount,
        activeCabinets,
        userCount,
        claudeMonth: {
          requests: usageThisMonth._count,
          costFcfa: Number(usageThisMonth._sum.costFcfa ?? 0),
        },
        pendingCommissions: {
          count: pendingCommissions._count,
          totalFcfa: Number(pendingCommissions._sum.commissionAmountFcfa ?? 0),
        },
      };
    });
  }


  // ==========================================================
  // CRUD Cabinet (super admin)
  // ==========================================================

  /** Filter automatique : les cabinets archivés sont cachés par défaut */
  async listCabinetsFiltered(includeArchived: boolean = false) {
    return this.prisma.withPlatformContext(async () => {
      const where: any = includeArchived ? {} : { deletedAt: null };
      const cabinets = await this.prisma.cabinet.findMany({
        where,
        include: {
          subscription: true,
          _count: { select: { users: true, tenders: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const results = await Promise.all(cabinets.map(async (c) => {
        const tenderStats = await this.prisma.tender.groupBy({
          by: ['stage'],
          where: { cabinetId: c.id },
          _count: true,
          _sum: { wonAmount: true },
        });

        const stats = { won: 0, lost: 0, inProgress: 0, wonAmountFcfa: 0 };
        for (const s of tenderStats) {
          if (s.stage === 'WON') {
            stats.won = s._count;
            stats.wonAmountFcfa = Number(s._sum.wonAmount ?? 0);
          } else if (s.stage === 'LOST') stats.lost = s._count;
          else if (s.stage !== 'CANCELLED') stats.inProgress += s._count;
        }

        const startOfMonth = new Date();
        startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
        const usageAgg = await this.prisma.claudeUsageLog.aggregate({
          where: { cabinetId: c.id, createdAt: { gte: startOfMonth } },
          _count: true,
          _sum: { costFcfa: true },
        });

        return {
          id: c.id, name: c.name, country: c.country, status: c.status,
          createdAt: c.createdAt,
          deletedAt: (c as any).deletedAt ?? null,
          platformCommissionRate: Number(c.platformCommissionRate ?? 0),
          logoUrl: (c as any).logoUrl ?? null,
          userCount: c._count.users,
          tenderCount: c._count.tenders,
          stats,
          subscription: c.subscription ? {
            status: c.subscription.status,
            nextBillingDate: c.subscription.nextBillingDate,
            lastPaidAt: c.subscription.lastPaidAt,
            monthlyAmountFcfa: Number(c.subscription.monthlyAmountFcfa),
          } : null,
          claudeMonth: {
            requests: usageAgg._count,
            costFcfa: Number(usageAgg._sum.costFcfa ?? 0),
          },
        };
      }));

      return results;
    });
  }

  /**
   * Crée un cabinet + 1er utilisateur admin (invitation email)
   */
  async createCabinet(data: {
    name: string;
    country: string;
    currency: string;
    vatRate: number;
    language: string;
    adminEmail: string;
    adminFirstName: string;
    adminLastName: string;
    monthlySubscriptionFcfa?: number;
    platformCommissionRate?: number;
  }) {
    return this.prisma.withPlatformContext(async () => {
      // Crée le cabinet
      const cabinet = await this.prisma.cabinet.create({
        data: {
          name: data.name,
          country: data.country as any,
          currency: data.currency,
          vatRate: data.vatRate,
          language: data.language,
          status: 'TRIAL',
          platformCommissionRate: data.platformCommissionRate ?? 0.02,
        } as any,
      });

      // Crée la subscription TRIAL (30 jours)
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setDate(periodEnd.getDate() + 30);
      await this.prisma.subscription.create({
        data: {
          cabinetId: cabinet.id,
          status: 'TRIAL',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          nextBillingDate: periodEnd,
          monthlyAmountFcfa: data.monthlySubscriptionFcfa ?? 15000,
        },
      });

      // Crée l'admin avec invitation token (sera envoyé par email)
      const crypto = require('crypto');
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const admin = await this.prisma.user.create({
        data: {
          cabinetId: cabinet.id,
          email: data.adminEmail.toLowerCase().trim(),
          passwordHash: null,
          firstName: data.adminFirstName,
          lastName: data.adminLastName,
          role: 'ADMIN_CABINET',
          isActive: false,
          invitationToken: token,
          invitationExpiresAt: expiresAt,
          invitedAt: new Date(),
        },
      });

      // Envoie l'email d'invitation
      await this.sendInvitationEmail({
        email: admin.email,
        firstName: admin.firstName,
        cabinetName: cabinet.name,
        token,
      });

      return { cabinet, admin: { id: admin.id, email: admin.email } };
    });
  }

  /** UPDATE complet d'un cabinet */
  async updateCabinetFull(cabinetId: string, data: {
    name?: string;
    country?: string;
    currency?: string;
    vatRate?: number;
    language?: string;
    status?: string;
    platformCommissionRate?: number;
    monthlySubscriptionFcfa?: number;
  }) {
    return this.prisma.withPlatformContext(async () => {
      const cabinetUpdate: any = {};
      if (data.name !== undefined) cabinetUpdate.name = data.name;
      if (data.country !== undefined) cabinetUpdate.country = data.country as any;
      if (data.currency !== undefined) cabinetUpdate.currency = data.currency;
      if (data.vatRate !== undefined) cabinetUpdate.vatRate = data.vatRate;
      if (data.language !== undefined) cabinetUpdate.language = data.language;
      if (data.status !== undefined) cabinetUpdate.status = data.status;
      if (data.platformCommissionRate !== undefined) {
        cabinetUpdate.platformCommissionRate = data.platformCommissionRate;
      }

      const cabinet = await this.prisma.cabinet.update({
        where: { id: cabinetId },
        data: cabinetUpdate,
      });

      if (data.monthlySubscriptionFcfa !== undefined) {
        await this.prisma.subscription.upsert({
          where: { cabinetId },
          create: {
            cabinetId,
            status: 'TRIAL',
            monthlyAmountFcfa: data.monthlySubscriptionFcfa,
          },
          update: { monthlyAmountFcfa: data.monthlySubscriptionFcfa },
        });
      }

      return cabinet;
    });
  }

  /** ARCHIVE : soft delete + désactive users + suspend subscription */
  async archiveCabinet(cabinetId: string) {
    return this.prisma.withPlatformContext(async () => {
      const now = new Date();
      // Soft delete cabinet
      await this.prisma.cabinet.update({
        where: { id: cabinetId },
        data: { deletedAt: now, status: 'CANCELLED' } as any,
      });
      // Bloque tous les users
      await this.prisma.user.updateMany({
        where: { cabinetId },
        data: { isActive: false },
      });
      // Suspend subscription
      await this.prisma.subscription.updateMany({
        where: { cabinetId },
        data: { status: 'CANCELLED' },
      });
      return { cabinetId, archivedAt: now };
    });
  }

  /** RESTORE : réactive le cabinet archivé */
  async restoreCabinet(cabinetId: string) {
    return this.prisma.withPlatformContext(async () => {
      await this.prisma.cabinet.update({
        where: { id: cabinetId },
        data: { deletedAt: null, status: 'ACTIVE' } as any,
      });
      await this.prisma.subscription.updateMany({
        where: { cabinetId },
        data: { status: 'ACTIVE' },
      });
      return { cabinetId, restored: true };
    });
  }

  /** Envoie l'email d'invitation admin (factorisé de invitations.service) */
  private async sendInvitationEmail(d: {
    email: string;
    firstName: string;
    cabinetName: string;
    token: string;
  }) {
    try {
      const nodemailer = require('nodemailer');
      const host = process.env.SMTP_HOST;
      const port = Number(process.env.SMTP_PORT || '465');
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;
      if (!host || !user || !pass) {
        this.logger.warn(`SMTP non configuré — invitation ${d.email} non envoyée`);
        return;
      }
      const appUrl = process.env.APP_URL || 'http://localhost:3001';
      const link = `${appUrl}/invitations/accept?token=${d.token}`;
      const transporter = nodemailer.createTransport({
        host, port, secure: port === 465, auth: { user, pass },
      });
      const html = `
        <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #0f172a;">
          <div style="background: linear-gradient(135deg, #0d9488, #0f766e); padding: 20px; border-radius: 8px 8px 0 0; color: white;">
            <h1 style="margin: 0; font-size: 20px;">Bienvenue sur TenderPro</h1>
          </div>
          <div style="padding: 24px; background: white; border: 1px solid #e2e8f0; border-top: 0; border-radius: 0 0 8px 8px;">
            <p>Bonjour ${d.firstName},</p>
            <p>Votre cabinet <strong>${d.cabinetName}</strong> a été créé sur TenderPro. Vous êtes désigné comme administrateur.</p>
            <p>Cliquez sur le bouton ci-dessous pour activer votre compte :</p>
            <div style="margin: 28px 0;">
              <a href="${link}" style="display:inline-block;background:#0d9488;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">Activer mon compte</a>
            </div>
            <p style="color:#64748b;font-size:13px;">Ce lien expire dans 7 jours.</p>
          </div>
        </div>`;
      const fromName = process.env.SMTP_FROM_NAME || 'TenderPro';
      await transporter.sendMail({
        from: `"${fromName}" <${user}>`,
        to: d.email,
        subject: `[TenderPro] Activation de votre compte administrateur — ${d.cabinetName}`,
        html,
      });
      this.logger.log(`Email invitation admin envoyé à ${d.email}`);
    } catch (err: any) {
      this.logger.error(`SMTP error (admin invitation ${d.email}): ${err.message}`);
    }
  }

}
