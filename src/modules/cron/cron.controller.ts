import { Controller, HttpCode, Logger, Post, UseGuards } from '@nestjs/common';
import { CronSecretGuard } from '../../common/auth/cron-secret.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlatformService } from '../platform/platform.service';
import { ScrapersService } from '../scrapers/scrapers.service';

/**
 * Endpoints déclenchés par un cron externe (Railway Cron Jobs, cron-job.org…).
 *
 * Tous les endpoints sont protégés par :
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Configurer la variable d'env `CRON_SECRET` côté Railway. Côté ordonnanceur
 * externe, configurer un POST sur l'URL Railway publique du service avec ce
 * header. Si `CRON_SECRET` est vide, tous les appels sont refusés.
 *
 * URLs typiques (l'host est dynamique, dépend de l'env Railway) :
 *   POST https://<service>.up.railway.app/api/cron/scrapers/run-all     (toutes les 30 min)
 *   POST https://<service>.up.railway.app/api/cron/platform/daily-tasks (1×/j à 9h Abidjan)
 */
@Controller('cron')
@UseGuards(CronSecretGuard)
export class CronController {
  private readonly logger = new Logger(CronController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scrapers: ScrapersService,
    private readonly platform: PlatformService,
  ) {}

  /** Lance tous les scrapers actifs. Remplace l'ancien `@Cron(EVERY_30_MINUTES)`. */
  @Post('scrapers/run-all')
  @HttpCode(200)
  async scrapersRunAll() {
    this.logger.log('[cron] scrapers/run-all');
    return this.prisma.withPlatformContext(() => this.scrapers.runAll());
  }

  /** Tâches plateforme quotidiennes : rappels J-1 + suspensions impayés. */
  @Post('platform/daily-tasks')
  @HttpCode(200)
  async platformDailyTasks() {
    this.logger.log('[cron] platform/daily-tasks');
    const reminders = await this.platform.runReminderCheck().catch((err: any) => {
      this.logger.error(`runReminderCheck: ${err.message}`);
      return { error: err.message };
    });
    const suspensions = await this.platform.runSuspensionCheck().catch((err: any) => {
      this.logger.error(`runSuspensionCheck: ${err.message}`);
      return { error: err.message };
    });
    return { reminders, suspensions };
  }
}
