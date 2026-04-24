import {
  BadRequestException, ConflictException, Injectable, Logger,
  NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, Grade, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly fromAddress: string;
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || '465');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const fromName = process.env.SMTP_FROM_NAME || 'TenderPro';

    this.fromAddress = user ? `"${fromName}" <${user}>` : 'TenderPro <noreply@tenderpro.dev>';
    this.appUrl = process.env.APP_URL || 'http://localhost:3001';

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host, port, secure: port === 465, auth: { user, pass },
      });
    } else {
      this.transporter = null;
      this.logger.warn('SMTP non configuré — les invitations ne pourront pas être envoyées');
    }
  }

  /**
   * Crée un user avec un token d'invitation + envoie l'email.
   * Appelé par l'admin cabinet.
   */
  async invite(params: {
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
    grade?: Grade | null;
    invitedById: string;
  }) {
    const cabinetId = TenantContext.tenantId();
    const normalizedEmail = params.email.toLowerCase().trim();

    // Vérifie l'unicité
    const existing = await this.prisma.user.findFirst({
      where: { cabinetId, email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException(
        existing.passwordHash
          ? 'Cet utilisateur a déjà accepté une invitation'
          : 'Une invitation est déjà en cours pour cet email',
      );
    }

    // Génère un token sécurisé
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

    // Récupère le cabinet et l'inviteur
    const cabinet = await this.prisma.cabinet.findUnique({ where: { id: cabinetId } });
    if (!cabinet) throw new NotFoundException('Cabinet introuvable');

    const inviter = await this.prisma.user.findUnique({
      where: { id: params.invitedById },
    });

    // Crée le user en attente
    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        firstName: params.firstName,
        lastName: params.lastName,
        role: params.role,
        grade: params.grade ?? null,
        passwordHash: null, // rempli à l'acceptation
        isActive: false, // activé à l'acceptation
        invitationToken: token,
        invitationExpiresAt: expiresAt,
        invitedById: params.invitedById,
        invitedAt: new Date(),
        cabinetId,
      },
      select: {
        id: true, email: true, firstName: true, lastName: true, role: true,
        grade: true, isActive: true, lastLoginAt: true, createdAt: true,
        invitationExpiresAt: true,
      },
    });

    // Envoie l'email (non-bloquant)
    await this.sendInvitationEmail({
      email: normalizedEmail,
      firstName: params.firstName,
      cabinetName: cabinet.name,
      inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}`.trim() : null,
      token,
    });

    return user;
  }

  /** Valide un token (lecture seule) et renvoie les infos pour la page d'acceptation */
  async validateToken(token: string) {
    const user = await this.prisma.withPlatformContext(() =>
      this.prisma.user.findFirst({
        where: { invitationToken: token },
        include: { cabinet: true, invitedBy: true },
      }),
    );

    if (!user) throw new NotFoundException('Invitation invalide');
    if (!user.invitationExpiresAt || user.invitationExpiresAt < new Date()) {
      throw new BadRequestException('Invitation expirée — demandez un renouvellement');
    }
    if (user.passwordHash) {
      throw new BadRequestException('Invitation déjà acceptée');
    }

    return {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      cabinetName: user.cabinet.name,
      invitedBy: user.invitedBy
        ? `${user.invitedBy.firstName} ${user.invitedBy.lastName}`.trim()
        : null,
    };
  }

  /** Accepte une invitation : définit le password et active le compte */
  async accept(params: { token: string; password: string }) {
    if (params.password.length < 8) {
      throw new BadRequestException('Mot de passe trop court (8 caractères minimum)');
    }

    const user = await this.prisma.withPlatformContext(() =>
      this.prisma.user.findFirst({
        where: { invitationToken: params.token },
        include: { cabinet: true },
      }),
    );

    if (!user) throw new NotFoundException('Invitation invalide');
    if (!user.invitationExpiresAt || user.invitationExpiresAt < new Date()) {
      throw new BadRequestException('Invitation expirée');
    }
    if (user.passwordHash) {
      throw new BadRequestException('Invitation déjà acceptée');
    }

    const rounds = Number(this.config.get('BCRYPT_ROUNDS', 12));
    const passwordHash = await bcrypt.hash(params.password, rounds);

    await this.prisma.withPlatformContext(() =>
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          isActive: true,
          invitationToken: null,
          invitationExpiresAt: null,
          lastLoginAt: new Date(),
        },
      }),
    );

    // Générer un JWT pour connexion automatique
    const accessToken = this.jwt.sign(
      {
        sub: user.id,
        cabinetId: user.cabinetId,
        role: user.role,
        grade: user.grade,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: this.config.get('JWT_EXPIRES_IN', '12h'),
      },
    );

    return {
      accessToken,
      user: {
        id: user.id, email: user.email,
        firstName: user.firstName, lastName: user.lastName,
        role: user.role, grade: user.grade,
        cabinet: { id: user.cabinet.id, name: user.cabinet.name },
      },
    };
  }

  /** Renvoie une invitation (pour un user déjà invité mais pas encore activé) */
  async resend(userId: string) {
    const cabinetId = TenantContext.tenantId();
    const user = await this.prisma.user.findFirst({
      where: { id: userId, cabinetId },
      include: { cabinet: true, invitedBy: true },
    });

    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (user.passwordHash) {
      throw new BadRequestException('Cet utilisateur est déjà actif');
    }

    // Regénère un nouveau token + étend l'expiration
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        invitationToken: token,
        invitationExpiresAt: expiresAt,
      },
    });

    await this.sendInvitationEmail({
      email: user.email,
      firstName: user.firstName,
      cabinetName: user.cabinet.name,
      inviterName: user.invitedBy
        ? `${user.invitedBy.firstName} ${user.invitedBy.lastName}`.trim()
        : null,
      token,
    });

    return { ok: true, expiresAt };
  }

  // ============================================================
  // EMAIL
  // ============================================================
  private async sendInvitationEmail(d: {
    email: string;
    firstName: string;
    cabinetName: string;
    inviterName: string | null;
    token: string;
  }) {
    if (!this.transporter) {
      this.logger.warn(`Email invitation NON envoyé à ${d.email} (SMTP non configuré)`);
      return;
    }

    const link = `${this.appUrl}/invitations/accept?token=${d.token}`;
    const inviterLine = d.inviterName
      ? `<p style="color: #64748b; margin-top: 0;">${d.inviterName} vous invite à rejoindre <strong>${d.cabinetName}</strong> sur TenderPro.</p>`
      : `<p style="color: #64748b; margin-top: 0;">Vous êtes invité à rejoindre <strong>${d.cabinetName}</strong> sur TenderPro.</p>`;

    const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #0f172a;">
      <div style="background: linear-gradient(135deg, #0d9488, #0f766e); padding: 20px; border-radius: 8px 8px 0 0; color: white;">
        <h1 style="margin: 0; font-size: 20px;">TenderPro — Invitation</h1>
      </div>
      <div style="padding: 24px; background: white; border: 1px solid #e2e8f0; border-top: 0; border-radius: 0 0 8px 8px;">
        <p>Bonjour ${d.firstName},</p>
        ${inviterLine}
        <p>TenderPro est la plateforme de pilotage des appels d'offres pour cabinets d'audit et de conseil.</p>
        <div style="margin: 28px 0;">
          <a href="${link}"
             style="display: inline-block; background: #0d9488; color: white; padding: 12px 24px;
                    border-radius: 6px; text-decoration: none; font-weight: 500;">
            Accepter l'invitation
          </a>
        </div>
        <p style="color: #64748b; font-size: 13px;">
          Ce lien expire dans 7 jours. Si vous n'êtes pas à l'origine de cette invitation, ignorez cet email.
        </p>
        <p style="color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 32px;">
          Lien direct :<br/>
          <span style="word-break: break-all;">${link}</span>
        </p>
      </div>
    </div>
    `;

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: d.email,
        subject: `[TenderPro] Invitation à rejoindre ${d.cabinetName}`,
        html,
      });
      this.logger.log(`Email invitation envoyé à ${d.email}`);
    } catch (err: any) {
      this.logger.error(`SMTP error (invitation ${d.email}): ${err.message}`);
    }
  }
}
