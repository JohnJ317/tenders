import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import {
  CreateCompetitiveIntelDto,
  UpdateCompetitiveIntelDto,
} from './dto/competitive-intel.dto';

@Injectable()
export class CompetitiveIntelService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenderId: string) {
    await this.ensureTender(tenderId);
    const intels = await this.prisma.competitiveIntel.findMany({
      where: { tenderId },
      orderBy: [{ isWinner: 'desc' }, { createdAt: 'desc' }],
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return intels.map((i) => ({
      ...i,
      competitorPrice: i.competitorPrice ? Number(i.competitorPrice) : null,
    }));
  }

  async getById(id: string) {
    const i = await this.prisma.competitiveIntel.findFirst({
      where: { id, tender: { cabinetId: TenantContext.tenantId() } },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!i) throw new NotFoundException('Information concurrentielle introuvable');
    return { ...i, competitorPrice: i.competitorPrice ? Number(i.competitorPrice) : null };
  }

  async create(tenderId: string, dto: CreateCompetitiveIntelDto, userId: string) {
    const tender = await this.ensureTender(tenderId);
    const created = await this.prisma.competitiveIntel.create({
      data: {
        tenderId,
        competitorName: dto.competitorName,
        competitorPrice: dto.competitorPrice,
        currency: tender.currency,
        isWinner: dto.isWinner ?? false,
        source: dto.source,
        notes: dto.notes,
        createdById: userId,
      },
    });
    return { ...created, competitorPrice: created.competitorPrice ? Number(created.competitorPrice) : null };
  }

  async update(id: string, dto: UpdateCompetitiveIntelDto) {
    await this.getById(id);
    const updated = await this.prisma.competitiveIntel.update({
      where: { id },
      data: dto,
    });
    return { ...updated, competitorPrice: updated.competitorPrice ? Number(updated.competitorPrice) : null };
  }

  async delete(id: string) {
    await this.getById(id);
    await this.prisma.competitiveIntel.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Agrège les concurrents rencontrés par le cabinet : combien de fois vu,
   * combien de fois gagnant, prix moyen (si connu). Utile pour calibrer les offres.
   */
  async competitorStats() {
    const rows = await this.prisma.competitiveIntel.findMany({
      where: { tender: { cabinetId: TenantContext.tenantId() } },
      select: { competitorName: true, isWinner: true, competitorPrice: true },
    });

    const map = new Map<string, { seen: number; wins: number; prices: number[] }>();
    for (const r of rows) {
      const entry = map.get(r.competitorName) ?? { seen: 0, wins: 0, prices: [] };
      entry.seen += 1;
      if (r.isWinner) entry.wins += 1;
      if (r.competitorPrice) entry.prices.push(Number(r.competitorPrice));
      map.set(r.competitorName, entry);
    }

    const result = Array.from(map.entries())
      .map(([name, s]) => ({
        competitorName: name,
        timesEncountered: s.seen,
        timesWon: s.wins,
        winRate: s.seen > 0 ? Math.round((s.wins / s.seen) * 100) / 100 : 0,
        avgPrice: s.prices.length > 0
          ? Math.round(s.prices.reduce((a, b) => a + b, 0) / s.prices.length)
          : null,
      }))
      .sort((a, b) => b.timesEncountered - a.timesEncountered);

    return result;
  }

  private async ensureTender(tenderId: string) {
    const tender = await this.prisma.tender.findFirst({
      where: { id: tenderId, cabinetId: TenantContext.tenantId() },
    });
    if (!tender) throw new NotFoundException('AO introuvable');
    return tender;
  }
}
