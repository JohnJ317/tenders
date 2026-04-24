import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AlertsService } from '../alerts/alerts.service';

/**
 * Moteur de matching :
 * Pour chaque ScrapedTender en statut NEW, vérifie tous les WatchDomain actifs
 * de tous les cabinets. Si match, crée des Alert et met à jour le statut.
 */
@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
  ) {}

  /** Traite tous les ScrapedTender encore en NEW */
  async processNew() {
    const candidates = await this.prisma.scrapedTender.findMany({
      where: { status: 'NEW' },
      take: 200,
      orderBy: { scrapedAt: 'asc' },
    });

    if (candidates.length === 0) return { processed: 0, matched: 0 };

    // Charge tous les watch domains actifs (tous cabinets)
    const watches = await this.prisma.watchDomain.findMany({
      where: { isActive: true },
      include: { cabinet: { select: { id: true, name: true } } },
    });

    let matched = 0;

    for (const scraped of candidates) {
      const matchedCabinetIds = new Set<string>();

      for (const watch of watches) {
        if (this.matches(scraped, watch)) {
          matchedCabinetIds.add(watch.cabinetId);
          // Crée l'alerte (idempotent : si déjà existe pour ce couple, skip)
          await this.alerts.createNewMatchAlert(watch.cabinetId, scraped.id);
        }
      }

      const ids = Array.from(matchedCabinetIds);
      await this.prisma.scrapedTender.update({
        where: { id: scraped.id },
        data: {
          status: ids.length > 0 ? 'MATCHED' : 'IGNORED',
          matchedCabinetIds: ids,
          processedAt: new Date(),
        },
      });

      if (ids.length > 0) matched += 1;
    }

    this.logger.log(`Matching: ${candidates.length} processed, ${matched} matched at least one cabinet`);
    return { processed: candidates.length, matched };
  }

  private matches(scraped: any, watch: any): boolean {
    // 1. Filtre type (AO vs AMI/EOI)
    if (scraped.isEoi && !watch.includeEoi) return false;
    if (!scraped.isEoi && !watch.includeTenders) return false;

    // 2. Filtre pays (vide = tous)
    if (watch.countries.length > 0) {
      if (!scraped.country) return false;
      if (!watch.countries.includes(scraped.country) && !watch.countries.includes('ALL'))
        return false;
    }

    // 3. Filtre sources (vide = toutes)
    if (watch.sources.length > 0 && !watch.sources.includes(scraped.source)) return false;

    // 4. Filtre budget
    if (watch.minBudget && scraped.budgetIndicative) {
      if (Number(scraped.budgetIndicative) < Number(watch.minBudget)) return false;
    }
    if (watch.maxBudget && scraped.budgetIndicative) {
      if (Number(scraped.budgetIndicative) > Number(watch.maxBudget)) return false;
    }

    // 5. Filtre mots-clés (recherche dans titre + description)
    if (watch.keywords.length > 0) {
      const hay = `${scraped.title} ${scraped.description ?? ''}`.toLowerCase();
      const anyMatch = watch.keywords.some((k: string) => hay.includes(k.toLowerCase()));
      if (!anyMatch) return false;
    }

    // 6. Filtre secteurs
    if (watch.sectors.length > 0) {
      const sect = (scraped.sector ?? '').toLowerCase();
      const hay = `${scraped.title} ${scraped.description ?? ''}`.toLowerCase();
      const anyMatch = watch.sectors.some(
        (s: string) => sect.includes(s.toLowerCase()) || hay.includes(s.toLowerCase()),
      );
      if (!anyMatch) return false;
    }

    return true;
  }
}
