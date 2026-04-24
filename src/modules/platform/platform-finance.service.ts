import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export type Period = '1m' | '3m' | '6m' | '12m' | 'all';

@Injectable()
export class PlatformFinanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Retourne la date de début selon la période */
  private getPeriodStart(period: Period): Date | null {
    if (period === 'all') return null;
    const now = new Date();
    const months = { '1m': 1, '3m': 3, '6m': 6, '12m': 12 }[period];
    const d = new Date(now);
    d.setMonth(d.getMonth() - months);
    return d;
  }

  /** Dashboard financier complet */
  async getFinanceDashboard(period: Period = '12m') {
    return this.prisma.withPlatformContext(async () => {
      const periodStart = this.getPeriodStart(period);
      const now = new Date();

      // Début du mois courant pour les KPIs "ce mois"
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      // ============================================================
      // 1. MOIS COURANT
      // ============================================================

      // Cabinets actifs (non archivés, non cancelled)
      const activeCabinets = await this.prisma.cabinet.count({
        where: {
          deletedAt: null,
          status: { in: ['TRIAL', 'ACTIVE'] },
        } as any,
      });

      // Somme abonnements attendus ce mois (cabinets actifs × leur monthly amount)
      const subsAttendu = await this.prisma.subscription.aggregate({
        where: {
          status: { in: ['ACTIVE', 'GRACE_PERIOD'] },
          cabinet: { deletedAt: null } as any,
        } as any,
        _sum: { monthlyAmountFcfa: true },
      });
      const expectedMrrFcfa = Number(subsAttendu._sum.monthlyAmountFcfa ?? 0);

      // Abonnements effectivement payés ce mois
      const paidThisMonth = await this.prisma.payment.aggregate({
        where: {
          status: 'PAID',
          paidAt: { gte: startOfMonth, lte: now },
          subscriptionId: { not: null },
        },
        _count: true,
        _sum: { amountFcfa: true },
      });
      const paidMrrFcfa = Number(paidThisMonth._sum.amountFcfa ?? 0);

      // Commissions payées ce mois
      const commissionsPaidMonth = await this.prisma.commissionInvoice.aggregate({
        where: {
          status: 'PAID',
          paidAt: { gte: startOfMonth, lte: now },
        },
        _count: true,
        _sum: { commissionAmountFcfa: true },
      });
      const paidCommissionsFcfa = Number(commissionsPaidMonth._sum.commissionAmountFcfa ?? 0);

      // Coût Claude consommé ce mois
      const claudeThisMonth = await this.prisma.claudeUsageLog.aggregate({
        where: { createdAt: { gte: startOfMonth, lte: now } },
        _count: true,
        _sum: { costFcfa: true },
      });
      const claudeCostFcfa = Number(claudeThisMonth._sum.costFcfa ?? 0);
      const claudeRequests = claudeThisMonth._count;

      const revenuesMonth = paidMrrFcfa + paidCommissionsFcfa;
      const grossMarginFcfa = revenuesMonth - claudeCostFcfa;
      const grossMarginRate = revenuesMonth > 0 ? grossMarginFcfa / revenuesMonth : 0;
      const recoveryRate = expectedMrrFcfa > 0 ? paidMrrFcfa / expectedMrrFcfa : 0;

      // ============================================================
      // 2. IMPAYÉS EN COURS
      // ============================================================
      const unpaidSubs = await this.prisma.subscription.findMany({
        where: {
          status: { in: ['ACTIVE', 'GRACE_PERIOD'] },
          nextBillingDate: { lt: now },
          cabinet: { deletedAt: null } as any,
        } as any,
        include: { cabinet: { select: { id: true, name: true } } },
        orderBy: { nextBillingDate: 'asc' },
      });
      const unpaid = unpaidSubs.map((s) => {
        const daysLate = Math.floor(
          (now.getTime() - new Date(s.nextBillingDate!).getTime()) / (1000 * 60 * 60 * 24),
        );
        return {
          cabinetId: s.cabinet.id,
          cabinetName: s.cabinet.name,
          amountFcfa: Number(s.monthlyAmountFcfa),
          dueSince: s.nextBillingDate,
          daysLate,
        };
      });
      const unpaidTotalFcfa = unpaid.reduce((sum, u) => sum + u.amountFcfa, 0);

      // ============================================================
      // 3. ÉVOLUTION 12 MOIS (ou période)
      // ============================================================
      const monthsToShow =
        period === '1m' ? 1 :
        period === '3m' ? 3 :
        period === '6m' ? 6 :
        period === '12m' ? 12 : 24;

      const monthlyEvolution: any[] = [];
      for (let i = monthsToShow - 1; i >= 0; i--) {
        const monthStart = new Date();
        monthStart.setMonth(monthStart.getMonth() - i);
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const monthEnd = new Date(monthStart);
        monthEnd.setMonth(monthEnd.getMonth() + 1);

        const [subs, comm, claude, tenders] = await Promise.all([
          this.prisma.payment.aggregate({
            where: {
              status: 'PAID',
              paidAt: { gte: monthStart, lt: monthEnd },
              subscriptionId: { not: null },
            },
            _sum: { amountFcfa: true },
          }),
          this.prisma.commissionInvoice.aggregate({
            where: {
              status: 'PAID',
              paidAt: { gte: monthStart, lt: monthEnd },
            },
            _sum: { commissionAmountFcfa: true },
          }),
          this.prisma.claudeUsageLog.aggregate({
            where: { createdAt: { gte: monthStart, lt: monthEnd } },
            _sum: { costFcfa: true },
          }),
          this.prisma.tender.groupBy({
            by: ['stage'],
            where: {
              updatedAt: { gte: monthStart, lt: monthEnd },
              stage: { in: ['WON', 'LOST'] },
            },
            _count: true,
            _sum: { wonAmount: true },
          }),
        ]);

        const won = tenders.find((t) => t.stage === 'WON');
        const lost = tenders.find((t) => t.stage === 'LOST');

        monthlyEvolution.push({
          month: monthStart.toISOString().slice(0, 7),
          label: monthStart.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
          subscriptionFcfa: Number(subs._sum.amountFcfa ?? 0),
          commissionFcfa: Number(comm._sum.commissionAmountFcfa ?? 0),
          claudeCostFcfa: Number(claude._sum.costFcfa ?? 0),
          wonCount: won?._count ?? 0,
          lostCount: lost?._count ?? 0,
          wonAmountFcfa: Number(won?._sum.wonAmount ?? 0),
        });
      }

      // ============================================================
      // 4. STATS AO (sur période)
      // ============================================================
      const tenderWhere: any = {
        cabinet: { deletedAt: null } as any,
      };
      if (periodStart) {
        tenderWhere.updatedAt = { gte: periodStart };
      }

      const tenderStats = await this.prisma.tender.groupBy({
        by: ['stage'],
        where: tenderWhere,
        _count: true,
        _sum: { wonAmount: true },
      });

      const wonAgg = tenderStats.find((t) => t.stage === 'WON');
      const lostAgg = tenderStats.find((t) => t.stage === 'LOST');
      const inProgressCount = tenderStats
        .filter((t) => !['WON', 'LOST', 'CANCELLED'].includes(t.stage))
        .reduce((s, t) => s + t._count, 0);

      const wonCount = wonAgg?._count ?? 0;
      const lostCount = lostAgg?._count ?? 0;
      const totalWonLost = wonCount + lostCount;
      const winRate = totalWonLost > 0 ? wonCount / totalWonLost : 0;
      const totalWonAmount = Number(wonAgg?._sum.wonAmount ?? 0);

      // Commission totale générée sur la période (pas forcément payée)
      const commGenerated = await this.prisma.commissionInvoice.aggregate({
        where: periodStart ? { createdAt: { gte: periodStart } } : {},
        _sum: { commissionAmountFcfa: true },
      });
      const totalCommissionFcfa = Number(commGenerated._sum.commissionAmountFcfa ?? 0);

      // ============================================================
      // 5. TOP 5 CABINETS PAR COMMISSION
      // ============================================================
      const topCabinetsComm = await this.prisma.commissionInvoice.groupBy({
        by: ['cabinetId'],
        where: periodStart ? { createdAt: { gte: periodStart } } : {},
        _sum: { commissionAmountFcfa: true, wonAmountFcfa: true },
        _count: true,
        orderBy: { _sum: { commissionAmountFcfa: 'desc' } },
        take: 5,
      });

      const topCabinetsIds = topCabinetsComm.map((c) => c.cabinetId);
      const topCabinetsData =
        topCabinetsIds.length > 0
          ? await this.prisma.cabinet.findMany({
              where: { id: { in: topCabinetsIds } },
              select: { id: true, name: true, country: true },
            })
          : [];

      const topCabinets = topCabinetsComm.map((c) => {
        const cabinet = topCabinetsData.find((cd) => cd.id === c.cabinetId);
        return {
          cabinetId: c.cabinetId,
          cabinetName: cabinet?.name ?? '—',
          country: cabinet?.country ?? '',
          aoWon: c._count,
          wonAmountFcfa: Number(c._sum.wonAmountFcfa ?? 0),
          commissionFcfa: Number(c._sum.commissionAmountFcfa ?? 0),
        };
      });

      // ============================================================
      // RETURN
      // ============================================================
      return {
        period,
        // Mois courant
        currentMonth: {
          activeCabinets,
          expectedMrrFcfa,
          paidMrrFcfa,
          paidCommissionsFcfa,
          claudeCostFcfa,
          claudeRequests,
          revenuesFcfa: revenuesMonth,
          grossMarginFcfa,
          grossMarginRate,
          recoveryRate,
        },
        unpaid: {
          count: unpaid.length,
          totalFcfa: unpaidTotalFcfa,
          items: unpaid,
        },
        monthlyEvolution,
        tenderStats: {
          won: wonCount,
          lost: lostCount,
          inProgress: inProgressCount,
          winRate,
          totalWonAmountFcfa: totalWonAmount,
          totalCommissionFcfa,
        },
        topCabinets,
      };
    });
  }
}
