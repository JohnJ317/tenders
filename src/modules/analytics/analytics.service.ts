import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenderStage } from '@prisma/client';

/**
 * Service d'analytics.
 * Tous les endpoints acceptent une période (30d, 90d, ytd, lastYear, all).
 * Les comparaisons se font contre la période précédente de même durée.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Convertit un code de période en bornes temporelles. */
  private getPeriodBounds(period: string): { from: Date; to: Date; prevFrom: Date; prevTo: Date } {
    const now = new Date();
    const to = now;
    let from: Date;

    switch (period) {
      case '30d':
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'ytd':
        from = new Date(now.getFullYear(), 0, 1);
        break;
      case 'lastYear':
        return {
          from: new Date(now.getFullYear() - 1, 0, 1),
          to: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59),
          prevFrom: new Date(now.getFullYear() - 2, 0, 1),
          prevTo: new Date(now.getFullYear() - 2, 11, 31, 23, 59, 59),
        };
      case 'all':
      default:
        from = new Date(2020, 0, 1); // historique raisonnable
        break;
    }

    // Période précédente : même durée juste avant
    const durationMs = to.getTime() - from.getTime();
    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - durationMs);

    return { from, to, prevFrom, prevTo };
  }

  /** KPIs principaux + comparaison période précédente */
  async getKpis(cabinetId: string, period: string) {
    const { from, to, prevFrom, prevTo } = this.getPeriodBounds(period);

    // AO créés dans la période
    const [currentTenders, prevTenders] = await Promise.all([
      this.prisma.tender.findMany({
        where: { cabinetId, createdAt: { gte: from, lte: to } },
        select: {
          stage: true,
          wonAmount: true,
          ourProposedAmount: true,
          budgetIndicative: true,
          createdAt: true,
          transitions: {
            select: { toStage: true, performedAt: true },
            orderBy: { performedAt: 'asc' },
          },
        },
      }),
      this.prisma.tender.findMany({
        where: { cabinetId, createdAt: { gte: prevFrom, lte: prevTo } },
        select: { stage: true, wonAmount: true },
      }),
    ]);

    const computeKpis = (tenders: typeof currentTenders) => {
      const total = tenders.length;
      const finals = tenders.filter((t) => ['WON', 'LOST'].includes(t.stage));
      const won = tenders.filter((t) => t.stage === 'WON');
      const winRate = finals.length > 0 ? (won.length / finals.length) * 100 : 0;
      const wonValue = won.reduce((s, t) => s + Number(t.wonAmount ?? 0), 0);
      return { total, winRate, wonCount: won.length, wonValue };
    };

    const current = computeKpis(currentTenders);
    const prev = computeKpis(prevTenders as any);

    // Cycle moyen (Veille → Soumission) en jours, sur les AO terminés
    const cycleTimes: number[] = [];
    for (const t of currentTenders) {
      const watching = t.transitions.find((tr) => tr.toStage === 'WATCHING');
      const submitted = t.transitions.find(
        (tr) => tr.toStage === 'SUBMITTED' || tr.toStage === 'WON' || tr.toStage === 'LOST',
      );
      if (watching && submitted) {
        const ms = new Date(submitted.performedAt).getTime()
          - new Date(watching.performedAt).getTime();
        if (ms > 0) cycleTimes.push(ms / (1000 * 60 * 60 * 24));
      } else if (t.createdAt && submitted) {
        const ms = new Date(submitted.performedAt).getTime()
          - new Date(t.createdAt).getTime();
        if (ms > 0) cycleTimes.push(ms / (1000 * 60 * 60 * 24));
      }
    }
    const avgCycleDays = cycleTimes.length > 0
      ? cycleTimes.reduce((s, d) => s + d, 0) / cycleTimes.length
      : null;

    return {
      period: { from, to, prevFrom, prevTo },
      totalAO: {
        current: current.total,
        previous: prev.total,
        delta: prev.total > 0 ? ((current.total - prev.total) / prev.total) * 100 : null,
      },
      winRate: {
        current: current.winRate,
        previous: prev.winRate,
        delta: prev.winRate > 0 ? current.winRate - prev.winRate : null,
      },
      wonCount: {
        current: current.wonCount,
        previous: prev.wonCount,
        delta: prev.wonCount > 0 ? ((current.wonCount - prev.wonCount) / prev.wonCount) * 100 : null,
      },
      wonValue: {
        current: current.wonValue,
        previous: prev.wonValue,
        delta: prev.wonValue > 0 ? ((current.wonValue - prev.wonValue) / prev.wonValue) * 100 : null,
      },
      avgCycleDays,
    };
  }

  /** Funnel : nombre d'AO ayant atteint chaque étape + taux de conversion */
  async getFunnel(cabinetId: string, period: string) {
    const { from, to } = this.getPeriodBounds(period);

    const tenders = await this.prisma.tender.findMany({
      where: { cabinetId, createdAt: { gte: from, lte: to } },
      select: {
        stage: true,
        transitions: {
          select: { toStage: true },
        },
      },
    });

    const stages: TenderStage[] = [
      'WATCHING', 'QUALIFICATION', 'EOI', 'SHORTLISTED', 'PREPARING', 'SUBMITTED', 'NEGOTIATION', 'WON',
    ];

    const stageRanks: Record<TenderStage, number> = {
      WATCHING: 0,
      QUALIFICATION: 1,
      EOI: 2,
      SHORTLISTED: 3,
      PREPARING: 4,
      SUBMITTED: 5,
      NEGOTIATION: 6,
      WON: 7,
      LOST: 7,
      CANCELLED: -1,
    };

    // Pour chaque AO, calculer quelle a été l'étape max atteinte
    const maxRankByTender = tenders.map((t) => {
      const currentRank = stageRanks[t.stage] ?? 0;
      const transitionRanks = t.transitions.map((tr) => stageRanks[tr.toStage] ?? 0);
      const max = Math.max(currentRank, ...transitionRanks, 0);
      return max;
    });

    const funnel = stages.map((stage) => {
      const rank = stageRanks[stage];
      const count = maxRankByTender.filter((r) => r >= rank).length;
      return { stage, count };
    });

    // Taux de conversion entre étapes
    for (let i = 0; i < funnel.length; i++) {
      const prev = i > 0 ? funnel[i - 1].count : funnel[0].count;
      (funnel[i] as any).conversionRate = prev > 0 ? (funnel[i].count / prev) * 100 : 0;
    }

    // Séparer WON et LOST au bout
    const submitted = maxRankByTender.filter((r) => r >= stageRanks.SUBMITTED).length;
    const lost = tenders.filter((t) => t.stage === 'LOST').length;

    return {
      period: { from, to },
      stages: funnel,
      lostCount: lost,
      submittedCount: submitted,
    };
  }

  /** Segmentation : taux de gain par dimension (country, sector, source) */
  async getSegments(cabinetId: string, period: string, by: 'country' | 'sector' | 'source') {
    const { from, to } = this.getPeriodBounds(period);

    const tenders = await this.prisma.tender.findMany({
      where: { cabinetId, createdAt: { gte: from, lte: to } },
      select: {
        country: true,
        sector: true,
        source: true,
        stage: true,
        wonAmount: true,
      },
    });

    const groupKey = (t: typeof tenders[0]): string => {
      if (by === 'country') return t.country ?? 'Non défini';
      if (by === 'sector') return t.sector ?? 'Non défini';
      if (by === 'source') return t.source;
      return 'Autre';
    };

    const groups: Record<string, { total: number; won: number; lost: number; value: number }> = {};
    for (const t of tenders) {
      const key = groupKey(t);
      if (!groups[key]) groups[key] = { total: 0, won: 0, lost: 0, value: 0 };
      groups[key].total++;
      if (t.stage === 'WON') {
        groups[key].won++;
        groups[key].value += Number(t.wonAmount ?? 0);
      }
      if (t.stage === 'LOST') groups[key].lost++;
    }

    const segments = Object.entries(groups).map(([key, data]) => ({
      segment: key,
      total: data.total,
      won: data.won,
      lost: data.lost,
      winRate: (data.won + data.lost) > 0 ? (data.won / (data.won + data.lost)) * 100 : 0,
      wonValue: data.value,
    }));

    segments.sort((a, b) => b.total - a.total);

    return { period: { from, to }, by, segments };
  }

  /** Évolution temporelle : AO créés, soumis, gagnés par mois */
  async getTimeseries(cabinetId: string, period: string) {
    const { from, to } = this.getPeriodBounds(period);

    const tenders = await this.prisma.tender.findMany({
      where: { cabinetId, createdAt: { gte: from, lte: to } },
      select: {
        createdAt: true,
        stage: true,
        transitions: { select: { toStage: true, performedAt: true } },
      },
    });

    const bucketKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    const buckets: Record<string, { ao: number; submitted: number; won: number }> = {};

    // Générer tous les mois de la période (même s'il n'y a pas de data)
    const current = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(to.getFullYear(), to.getMonth(), 1);
    while (current <= end) {
      buckets[bucketKey(current)] = { ao: 0, submitted: 0, won: 0 };
      current.setMonth(current.getMonth() + 1);
    }

    for (const t of tenders) {
      const key = bucketKey(new Date(t.createdAt));
      if (buckets[key]) buckets[key].ao++;

      const submitted = t.transitions.find((tr) => tr.toStage === 'SUBMITTED');
      if (submitted) {
        const subKey = bucketKey(new Date(submitted.performedAt));
        if (buckets[subKey]) buckets[subKey].submitted++;
      }

      const won = t.transitions.find((tr) => tr.toStage === 'WON');
      if (won) {
        const wonKey = bucketKey(new Date(won.performedAt));
        if (buckets[wonKey]) buckets[wonKey].won++;
      }
    }

    const series = Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data }));

    return { period: { from, to }, series };
  }
}
