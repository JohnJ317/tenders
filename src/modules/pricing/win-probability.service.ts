import { Injectable } from '@nestjs/common';
import { TenderStage } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant-context';

export type WinConfidence = 'insufficient_data' | 'low' | 'medium' | 'high';

export interface WinProbabilityEstimate {
  probability: number | null; // 0 à 1, ou null si insufficient_data
  confidence: WinConfidence;
  sampleSize: number;
  wonCount: number;
  lostCount: number;
  medianWinningPrice: number | null;
  medianLosingPrice: number | null;
  budgetRatio: number | null;
  explanation: string;
}

/**
 * Estime la probabilité de gain d'un AO à un prix donné, à partir de l'historique
 * du cabinet. Heuristique pragmatique, sans ML :
 *
 * 1. On isole les AO passés finaux (WON/LOST) du même secteur si possible
 * 2. On calcule la médiane des prix gagnants et perdants
 * 3. On positionne le prix proposé :
 *    - ≤ médiane gagnants : forte probabilité
 *    - entre les deux médianes : probabilité moyenne
 *    - ≥ médiane perdants : probabilité faible
 * 4. Ajustement selon écart au budget indicatif si connu
 *
 * Confiance :
 * - < 5 AO : insufficient_data (on ne retourne pas de chiffre)
 * - 5-9   : low
 * - 10-19 : medium
 * - 20+   : high
 */
@Injectable()
export class WinProbabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async estimate(tenderId: string, proposedPrice: number): Promise<WinProbabilityEstimate> {
    const tender = await this.prisma.tender.findFirst({
      where: { id: tenderId, cabinetId: TenantContext.tenantId() },
      select: { id: true, sector: true, budgetIndicative: true, cabinetId: true },
    });
    if (!tender) {
      return empty('AO introuvable');
    }

    // Historique : AO finaux du même cabinet, même secteur en priorité
    // (si pas assez avec ce filtre, on élargit)
    const baseWhere = {
      cabinetId: tender.cabinetId,
      id: { not: tenderId },
      stage: { in: [TenderStage.WON, TenderStage.LOST] },
    };

    let similar = tender.sector
      ? await this.prisma.tender.findMany({
          where: { ...baseWhere, sector: tender.sector },
          select: { stage: true, wonAmount: true, ourProposedAmount: true, budgetIndicative: true },
          take: 100,
          orderBy: { updatedAt: 'desc' },
        })
      : [];

    if (similar.length < 5) {
      // Fallback : toutes catégories
      similar = await this.prisma.tender.findMany({
        where: baseWhere,
        select: { stage: true, wonAmount: true, ourProposedAmount: true, budgetIndicative: true },
        take: 100,
        orderBy: { updatedAt: 'desc' },
      });
    }

    const sampleSize = similar.length;

    if (sampleSize < 5) {
      return {
        probability: null,
        confidence: 'insufficient_data',
        sampleSize,
        wonCount: similar.filter((t) => t.stage === 'WON').length,
        lostCount: similar.filter((t) => t.stage === 'LOST').length,
        medianWinningPrice: null,
        medianLosingPrice: null,
        budgetRatio: null,
        explanation:
          `Seulement ${sampleSize} AO similaires dans l'historique. ` +
          `Besoin d'au moins 5 AO finaux (gagnés ou perdus) pour une estimation fiable. ` +
          `L'estimation s'améliorera au fur et à mesure que vous traitez des AO.`,
      };
    }

    const won = similar.filter((t) => t.stage === 'WON');
    const lost = similar.filter((t) => t.stage === 'LOST');

    const winningPrices = won
      .map((t) => Number(t.wonAmount ?? t.ourProposedAmount ?? 0))
      .filter((p) => p > 0);
    const losingPrices = lost
      .map((t) => Number(t.ourProposedAmount ?? 0))
      .filter((p) => p > 0);

    const medianWin = median(winningPrices);
    const medianLoss = median(losingPrices);

    // Scoring basé sur position relative
    let probability: number;
    if (medianWin === null && medianLoss === null) {
      probability = won.length / (won.length + lost.length);
    } else if (medianWin !== null && proposedPrice <= medianWin * 1.05) {
      probability = 0.70;
    } else if (medianWin !== null && medianLoss !== null && proposedPrice <= (medianWin + medianLoss) / 2) {
      probability = 0.50;
    } else if (medianLoss !== null && proposedPrice <= medianLoss) {
      probability = 0.35;
    } else {
      probability = 0.20;
    }

    // Ajustement budget
    const budgetIndicative = tender.budgetIndicative ? Number(tender.budgetIndicative) : null;
    let budgetRatio: number | null = null;
    if (budgetIndicative && budgetIndicative > 0) {
      budgetRatio = proposedPrice / budgetIndicative;
      if (budgetRatio > 1.10) {
        probability *= 0.5; // bien au-dessus du budget → très pénalisant
      } else if (budgetRatio > 1.02) {
        probability *= 0.75;
      } else if (budgetRatio < 0.80) {
        probability *= 1.15; // très compétitif
      }
    }

    probability = Math.min(0.95, Math.max(0.05, probability));

    const confidence: WinConfidence =
      sampleSize >= 20 ? 'high' : sampleSize >= 10 ? 'medium' : 'low';

    return {
      probability: Math.round(probability * 100) / 100,
      confidence,
      sampleSize,
      wonCount: won.length,
      lostCount: lost.length,
      medianWinningPrice: medianWin !== null ? Math.round(medianWin) : null,
      medianLosingPrice: medianLoss !== null ? Math.round(medianLoss) : null,
      budgetRatio: budgetRatio !== null ? Math.round(budgetRatio * 100) / 100 : null,
      explanation: this.buildExplanation(sampleSize, tender.sector, won.length, lost.length, budgetRatio),
    };
  }

  private buildExplanation(
    sampleSize: number,
    sector: string | null,
    won: number,
    lost: number,
    budgetRatio: number | null,
  ): string {
    const sectorStr = sector ? `du secteur "${sector}"` : 'similaires (toutes catégories)';
    const base = `Basé sur ${sampleSize} AO ${sectorStr} (${won} gagnés, ${lost} perdus).`;
    if (budgetRatio === null) return base;
    if (budgetRatio > 1.10) return `${base} Prix proposé ${Math.round((budgetRatio - 1) * 100)}% au-dessus du budget indicatif — pénalité forte.`;
    if (budgetRatio < 0.85) return `${base} Prix proposé ${Math.round((1 - budgetRatio) * 100)}% sous le budget indicatif — très compétitif.`;
    return `${base} Prix proposé aligné sur le budget indicatif.`;
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function empty(message: string): WinProbabilityEstimate {
  return {
    probability: null,
    confidence: 'insufficient_data',
    sampleSize: 0,
    wonCount: 0,
    lostCount: 0,
    medianWinningPrice: null,
    medianLosingPrice: null,
    budgetRatio: null,
    explanation: message,
  };
}
