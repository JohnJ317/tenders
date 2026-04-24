import {
  Controller, Get, Injectable, Logger, Module, OnModuleInit,
  Param, Post, UseGuards,
} from '@nestjs/common';
import { Cron, CronExpression, ScheduleModule } from '@nestjs/schedule';
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

@Injectable()
export class ScraperSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ScraperSchedulerService.name);

  constructor(private readonly scrapers: ScrapersService) {}

  onModuleInit() {
    this.logger.log(
      `Scheduler initialisé — ${this.scrapers.listSources().filter((s) => s.enabled).length} scrapers actifs`,
    );
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async scheduledRun() {
    const sources = this.scrapers.listSources().filter((s) => s.enabled);
    for (const src of sources) {
      try {
        await this.scrapers.runScraper(src.sourceCode);
      } catch (err: any) {
        this.logger.warn(`Scheduled run of ${src.sourceCode} failed: ${err.message}`);
      }
    }
  }
}

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
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE)
  runOne(@Param('sourceCode') sourceCode: string) {
    return this.scrapers.runScraper(sourceCode);
  }

  @Post('run-all')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE)
  runAll() { return this.scrapers.runAll(); }
}

@Module({
  imports: [ScheduleModule.forRoot(), MatchingModule, J360Module],
  controllers: [ScrapersController],
  providers: [
    ScrapersService,
    ScraperSchedulerService,
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
