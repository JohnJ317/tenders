import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';
import { TenantContext } from './tenant-context';

export interface JwtPayload {
  sub: string;       // userId
  cabinetId: string; // tenantId
  role: string;
  grade: string | null;
  iat: number;
  exp: number;
} 

/**
 * Extrait le JWT du header Authorization, le vérifie, et place un contexte
 * tenant dans AsyncLocalStorage pour toute la durée de la requête.
 *
 * Les routes publiques (auth/login, auth/register, health) sont exclues
 * en définissant la liste des chemins publics ci-dessous.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly publicPaths = [
    '/api/auth/login',
    '/api/webhooks/wave',
    '/api/invitations/accept',
    '/api/invitations/validate',
    '/api/auth/register',
    '/api/health',
    // Endpoints cron : auth via CRON_SECRET (Bearer), pas via JWT.
    // Le CronSecretGuard valide le secret côté contrôleur.
    '/api/cron',
  ];

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Routes publiques : pas de tenant context, on laisse passer
    if (this.publicPaths.some((p) => req.originalUrl.split("?")[0].startsWith(p))) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token manquant');
    }

    const token = authHeader.slice(7);

    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Token invalide ou expiré');
    }

    if (!payload.cabinetId) {
      throw new UnauthorizedException('Token sans cabinetId');
    }

    // On expose le user sur req pour les decorators @CurrentUser.
    (req as Request & { user: JwtPayload }).user = payload;

    // Et on lance le reste du pipeline dans le contexte tenant.
    TenantContext.run(
      {
        tenantId: payload.cabinetId,
        userId: payload.sub,
        role: payload.role,
        grade: payload.grade,
      },
      () => next(),
    );
  }
}
