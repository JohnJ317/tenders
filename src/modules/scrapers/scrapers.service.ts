import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AbstractScraper, ScrapedItem } from './abstract-scraper';
import { MatchingService } from '../matching/matching.service';

export const SCRAPERS_TOKEN = 'SCRAPERS_TOKEN';

@Injectable()
export class ScrapersService {
  private readonly logger = new Logger(ScrapersService.name);

  constructor(
    @Inject(SCRAPERS_TOKEN) private readonly scrapers: AbstractScraper[],
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
  ) {}

  /** Retourne la liste de tous les scrapers enregistrés (enabled ou non) */
  listSources() {
    return this.scrapers.map((s) => ({
      sourceCode: s.sourceCode,
      sourceLabel: s.sourceLabel,
      countries: s.countries,
      baseUrl: s.baseUrl,
      enabled: s.enabled,
      intervalMinutes: s.intervalMinutes,
    }));
  }

  getScraper(sourceCode: string) {
    return this.scrapers.find((s) => s.sourceCode === sourceCode);
  }

  /**
   * Exécute un scraper donné. Persiste les nouveaux items et crée un ScraperRun.
   * Déclenche le matching pour les nouveaux items.
   */
  async runScraper(sourceCode: string): Promise<{ runId: string; itemsNew: number; errors: string[] }> {
    const scraper = this.getScraper(sourceCode);
    if (!scraper) throw new Error(`Scraper ${sourceCode} introuvable`);

    if (!scraper.enabled) {
      return { runId: '', itemsNew: 0, errors: ['Scraper disabled'] };
    }

    const run = await this.prisma.scraperRun.create({
      data: { source: sourceCode, status: 'SUCCESS' },
    });

    try {
      this.logger.log(`Running ${sourceCode}...`);
      const { items, errors } = await scraper.scrape();

      let newCount = 0;
      let errorCount = errors.length;

      for (const item of items) {
        try {
          const created = await this.upsertScrapedItem(scraper.sourceCode, item);
          if (created) newCount += 1;
        } catch (e: any) {
          errorCount += 1;
          this.logger.warn(`Persist error for ${item.externalRef}: ${e.message}`);
        }
      }

      // Lance le matching en arrière-plan (ne bloque pas la fin du run)
      this.matching.processNew().catch((e) => this.logger.warn('Matching err: ' + e.message));

      const status = errors.length === 0 && errorCount === 0 ? 'SUCCESS'
        : items.length === 0 ? 'FAILED'
        : 'PARTIAL';

      await this.prisma.scraperRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          status,
          itemsFound: items.length,
          itemsNew: newCount,
          itemsError: errorCount,
          errorMessage: errors.length ? errors.join(' | ').slice(0, 2000) : null,
        },
      });

      this.logger.log(`${sourceCode}: ${items.length} items found, ${newCount} new, ${errorCount} errors`);
      return { runId: run.id, itemsNew: newCount, errors };
    } catch (err: any) {
      await this.prisma.scraperRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          status: 'FAILED',
          errorMessage: err.message?.slice(0, 2000),
        },
      });
      throw err;
    }
  }

  /** Lance tous les scrapers activés en parallèle (limité) */
  async runAll() {
    const enabled = this.scrapers.filter((s) => s.enabled);
    const results = await Promise.allSettled(enabled.map((s) => this.runScraper(s.sourceCode)));
    return enabled.map((s, i) => ({
      source: s.sourceCode,
      result: results[i],
    }));
  }

  /**
   * Insère ou met à jour un ScrapedTender.
   * Retourne true si c'est un nouveau (pas trouvé avant).
   */
  private async upsertScrapedItem(source: string, item: ScrapedItem): Promise<boolean> {
    const existing = await this.prisma.scrapedTender.findUnique({
      where: { source_externalRef: { source, externalRef: item.externalRef } },
    });

    const data = {
      title: item.title,
      description: item.description,
      clientName: item.clientName,
      sector: item.sector,
      country: item.country,
      publishedAt: item.publishedAt,
      submissionDeadline: item.submissionDeadline,
      budgetIndicative: item.budgetIndicative,
      currency: item.currency,
      sourceUrl: item.sourceUrl,
      documentUrls: item.documentUrls ?? [],
      isEoi: item.isEoi ?? false,
      rawData: item.rawData as any,
    };

    if (existing) {
      // Mise à jour soft : uniquement si l'AO n'a pas encore été promu
      if (existing.status !== 'PROMOTED') {
        await this.prisma.scrapedTender.update({ where: { id: existing.id }, data });
      }
      return false;
    }

    await this.prisma.scrapedTender.create({
      data: { source, externalRef: item.externalRef, ...data },
    });
    return true;
  }
}
