import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly fromAddress: string;

  constructor(private readonly prisma: PrismaService) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || '465');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const fromName = process.env.SMTP_FROM_NAME || 'TenderPro';

    this.fromAddress = user ? `"${fromName}" <${user}>` : 'TenderPro <noreply@tenderpro.dev>';

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.logger.log(`SMTP configuré : ${user}@${host}:${port}`);
    } else {
      this.transporter = null;
      this.logger.warn('SMTP non configuré (SMTP_HOST/USER/PASS manquants) — emails désactivés');
    }
  }

  async sendNewMatchAlert(cabinetId: string, alertId: string) {
    if (!this.transporter) return;

    const recipients = await this.prisma.user.findMany({
      where: {
        cabinetId,
        isActive: true,
        role: { in: ['ADMIN_CABINET', 'ASSOCIE'] },
      },
      select: { email: true, firstName: true },
    });
    if (recipients.length === 0) return;

    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: { scrapedTender: true, cabinet: true },
    });
    if (!alert || !alert.scrapedTender) return;

    const scraped = alert.scrapedTender;
    const appUrl = process.env.APP_URL || 'http://localhost:3001';

    const html = this.buildHtml({
      cabinetName: alert.cabinet.name,
      title: scraped.title,
      source: scraped.source,
      country: scraped.country ?? 'non précisé',
      deadline: scraped.submissionDeadline
        ? new Date(scraped.submissionDeadline).toLocaleDateString('fr-FR')
        : 'non précisée',
      isEoi: scraped.isEoi,
      sourceUrl: scraped.sourceUrl,
      alertUrl: `${appUrl}/alerts`,
    });

    const subject = scraped.isEoi
      ? `[TenderPro] Nouvel AMI pertinent — ${scraped.title.slice(0, 80)}`
      : `[TenderPro] Nouvel AO pertinent — ${scraped.title.slice(0, 80)}`;

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: recipients.map((r) => r.email).join(', '),
        subject,
        html,
      });

      await this.prisma.alert.update({
        where: { id: alertId },
        data: { emailSentAt: new Date() },
      });

      this.logger.log(`Email envoyé à ${recipients.length} destinataire(s) pour alerte ${alertId}`);
    } catch (err: any) {
      this.logger.error(`SMTP error: ${err.message}`);
    }
  }

  private buildHtml(d: {
    cabinetName: string;
    title: string;
    source: string;
    country: string;
    deadline: string;
    isEoi: boolean;
    sourceUrl?: string | null;
    alertUrl: string;
  }) {
    return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #0f172a;">
      <div style="background: linear-gradient(135deg, #0d9488, #0f766e); padding: 20px; border-radius: 8px 8px 0 0; color: white;">
        <h1 style="margin: 0; font-size: 20px;">TenderPro — Nouvelle opportunité</h1>
      </div>
      <div style="padding: 24px; background: white; border: 1px solid #e2e8f0; border-top: 0; border-radius: 0 0 8px 8px;">
        <p style="color: #64748b; margin-top: 0;">Bonjour ${d.cabinetName},</p>
        <p>Un nouvel ${d.isEoi ? 'avis à manifestation d\'intérêt (AMI)' : 'appel d\'offres'} correspond à vos critères de veille :</p>
        <div style="background: #f1f5f9; border-left: 4px solid #0d9488; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0; font-weight: 600; font-size: 15px;">${d.title}</p>
          <p style="margin: 0; color: #64748b; font-size: 13px;">
            Source : ${d.source} · Pays : ${d.country} · Deadline : ${d.deadline}
          </p>
        </div>
        <div style="margin-top: 24px;">
          <a href="${d.alertUrl}" style="display: inline-block; background: #0d9488; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">
            Voir dans TenderPro
          </a>
          ${d.sourceUrl ? `
          <a href="${d.sourceUrl}" style="display: inline-block; margin-left: 8px; padding: 10px 20px; border: 1px solid #cbd5e1; color: #0f172a; border-radius: 6px; text-decoration: none;">
            Source originale
          </a>` : ''}
        </div>
        <p style="margin-top: 32px; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          Vous recevez cet email parce qu'un domaine de veille configuré par votre cabinet a matché cette opportunité.
        </p>
      </div>
    </div>
    `;
  }
}
