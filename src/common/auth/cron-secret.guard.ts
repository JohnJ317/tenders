import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Guard pour les endpoints déclenchés par un cron externe.
 *
 * Vérifie le header `Authorization: Bearer <CRON_SECRET>` contre
 * `process.env.CRON_SECRET`. Si la variable n'est pas définie, tous les
 * appels sont refusés (fail-closed).
 */
@Injectable()
export class CronSecretGuard implements CanActivate {
  private readonly logger = new Logger(CronSecretGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
      this.logger.warn("CRON_SECRET non défini — appel cron refusé");
      throw new UnauthorizedException('CRON_SECRET non configuré');
    }

    const req = context.switchToHttp().getRequest();
    const auth: string = req.headers['authorization'] || '';
    const [scheme, token] = auth.split(' ');
    if (scheme !== 'Bearer' || token !== expected) {
      throw new UnauthorizedException('Token cron invalide');
    }
    return true;
  }
}
