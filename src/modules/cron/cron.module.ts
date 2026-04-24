import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module';
import { ScrapersModule } from '../scrapers/scrapers.module';
import { CronController } from './cron.controller';

/**
 * Module Cron — endpoints HTTP déclenchés par un ordonnanceur externe.
 *
 * Remplace les anciens `@Cron` in-process des modules scrapers/platform.
 * Voir `cron.controller.ts` pour la liste des routes et la sécurisation.
 */
@Module({
  imports: [ScrapersModule, PlatformModule],
  controllers: [CronController],
})
export class CronModule {}
