import {
  Controller, Get, Module,
  Param, Post, UseGuards,
} from '@nestjs/common';
import { ScrapersService, SCRAPERS_TOKEN } from './scrapers.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AbstractScraper } from './abstract-scraper';

// Scrapers pleinement implémentés
import { WorldBankScraper } from './sources/world-bank.scraper';
import { SigmapScraper } from './sources/sigmap.scraper';
import { AfdScraper } from './sources/afd.scraper';
import { AfdbScraper } from './sources/afdb.scraper';
import { UngmScraper } from './sources/ungm.scraper';
import { EducarriereScraper } from './sources/educarriere.scraper';
import { BceaoScraper } from './sources/bceao.scraper';
import { J360Scraper } from './sources/j360.scraper';
// Stubs
import {
  ArmpSenegalScraper, ArcopBurkinaScraper, DgmpMaliScraper,
  ArmpTogoScraper, ArmpBeninScraper, ArmpNigerScraper,
  EuTedScraper, UsaidScraper,
} from './sources/stubs.scraper';

import { MatchingModule } from '../matching/matching.module';
import { J360Module } from '../j360/j360.module';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Role } from '@prisma/client';

const SCRAPER_CLASSES = [
  WorldBankScraper, SigmapScraper, AfdScraper, AfdbScraper, UngmScraper,
  EducarriereScraper, BceaoScraper, J360Scraper,
  ArmpSenegalScraper, ArcopBurkinaScraper, DgmpMaliScraper,
  ArmpTogoScraper, ArmpBeninScraper, ArmpNigerScraper,
  EuTedScraper, UsaidScraper,
];

// NOTE: l'ancien `ScraperSchedulerService` (cron in-process toutes les 30 min)
// a été retiré au profit d'un déclenchement HTTP externe.
// Voir `src/modules/cron/cron.controller.ts` (POST /api/cron/scrapers/run-all).

@Controller('scrapers')
@UseGuards(RolesGuard)
export class ScrapersController {
  constructor(
    private readonly scrapers: ScrapersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('sources')
  listSources() { return this.scrapers.listSources(); }

  @Get('runs')
  async recentRuns() {
    return this.prisma.scraperRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
  }

  @Post('run/:sourceCode')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  runOne(@Param('sourceCode') sourceCode: string) {
    return this.scrapers.runScraper(sourceCode);
  }

  @Post('run-all')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  runAll() { return this.scrapers.runAll(); }
}

@Module({
  imports: [MatchingModule, J360Module],
  controllers: [ScrapersController],
  providers: [
    ScrapersService,
    ...SCRAPER_CLASSES,
    {
      provide: SCRAPERS_TOKEN,
      inject: SCRAPER_CLASSES,
      useFactory: (...scrapers: AbstractScraper[]) => scrapers,
    },
  ],
  exports: [ScrapersService],
})
export class ScrapersModule {}
