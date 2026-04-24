import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Grade, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { PricingCoefficientsService } from '../pricing-coefficients/pricing-coefficients.service';
import { SavePricingDto, SimulatePricingDto } from './dto/pricing.dto';
import { WinProbabilityService } from './win-probability.service';

export interface HoursByGrade {
  associe: number;
  manager: number;
  senior: number;
  junior: number;
  assistant: number;
}

export interface PricingResult {
  // Inputs echo
  currency: string;
  hours: HoursByGrade;
  totalHours: number;

  // Grille appliquée
  hourlyRates: Record<Grade, number | null>;

  // Coûts par grade
  laborCostByGrade: HoursByGrade;
  laborCost: number;
  travelCost: number;
  otherCosts: number;
  baseCost: number;

  // Coefficients
  coefficientsApplied: Array<{
    code: string;
    label: string;
    category: string;
    multiplier: number;
  }>;
  combinedMultiplier: number;
  adjustedCost: number;

  // Prix cibles
  marginRates: {
    floor: number;
    target: number;
    ceiling: number;
  };
  prices: {
    floor: number;
    target: number;
    ceiling: number;
  };
  margins: {
    floor: number; // Marge absolue correspondante
    target: number;
    ceiling: number;
  };

  // Alignement budget client si connu
  budgetIndicative?: number;
  budgetAlignmentPrice?: number;
  budgetAlignmentIsWithinBounds?: boolean;

  // Meta
  tenderRef: {
    id: string;
    title: string;
    clientName: string | null;
    sector: string | null;
    submissionDeadline: Date | null;
  };
}

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coefficients: PricingCoefficientsService,
    private readonly winProba: WinProbabilityService,
  ) {}

  /**
   * Calcule une simulation (in-memory, sans persister).
   * Endpoint principal pour l'UX de simulation interactive.
   */
  async simulate(tenderId: string, dto: SimulatePricingDto): Promise<PricingResult> {
    const tender = await this.ensureTender(tenderId);

    // 1. Grille horaire active du cabinet
    const grille = await this.getActiveGrille(tender.cabinetId);

    // 2. Coefficients sélectionnés
    const coefs = await this.coefficients.getByCodes(dto.coefficientCodes);
    if (coefs.length !== dto.coefficientCodes.length) {
      const found = new Set(coefs.map((c) => c.code));
      const missing = dto.coefficientCodes.filter((c) => !found.has(c));
      throw new BadRequestException(
        `Coefficients introuvables ou inactifs: ${missing.join(', ')}`,
      );
    }

    // 3. Calculs
    const hours: HoursByGrade = {
      associe: dto.associeHours,
      manager: dto.managerHours,
      senior: dto.seniorHours,
      junior: dto.juniorHours,
      assistant: dto.assistantHours,
    };
    const totalHours = Object.values(hours).reduce((a, b) => a + b, 0);
    if (totalHours === 0) {
      throw new BadRequestException('Au moins une catégorie d\'heures doit être > 0');
    }

    const laborCostByGrade: HoursByGrade = {
      associe: hours.associe * (grille.ASSOCIE ?? 0),
      manager: hours.manager * (grille.MANAGER ?? 0),
      senior: hours.senior * (grille.SENIOR ?? 0),
      junior: hours.junior * (grille.JUNIOR ?? 0),
      assistant: hours.assistant * (grille.ASSISTANT ?? 0),
    };
    const laborCost = Object.values(laborCostByGrade).reduce((a, b) => a + b, 0);
    const travelCost = dto.travelCost ?? 0;
    const otherCosts = dto.otherCosts ?? 0;
    const baseCost = laborCost + travelCost + otherCosts;

    const combinedMultiplier = coefs.reduce((acc, c) => acc * c.multiplier, 1);
    const adjustedCost = baseCost * combinedMultiplier;

    // Marges — margin on revenue (convention consulting)
    // price = cost / (1 - margin) → margin = (price - cost) / price
    const floorMargin = dto.floorMarginRate ?? 0.10;
    const targetMargin = dto.targetMarginRate ?? 0.25;
    const ceilingMargin = dto.ceilingMarginRate ?? 0.40;

    if (!(floorMargin < targetMargin && targetMargin < ceilingMargin)) {
      throw new BadRequestException(
        'Les marges doivent respecter floor < target < ceiling',
      );
    }

    const floorPrice = adjustedCost / (1 - floorMargin);
    const targetPrice = adjustedCost / (1 - targetMargin);
    const ceilingPrice = adjustedCost / (1 - ceilingMargin);

    // Alignement budget
    let budgetAlignmentPrice: number | undefined;
    let budgetAlignmentIsWithinBounds: boolean | undefined;
    const budgetIndicative = tender.budgetIndicative
      ? Number(tender.budgetIndicative)
      : undefined;
    if (budgetIndicative) {
      // Stratégie : s'aligner à 98% du budget indicatif pour montrer effort sans descendre au plus bas
      budgetAlignmentPrice = Math.round(budgetIndicative * 0.98);
      budgetAlignmentIsWithinBounds =
        budgetAlignmentPrice >= floorPrice && budgetAlignmentPrice <= ceilingPrice;
    }

    return {
      currency: tender.currency,
      hours,
      totalHours,
      hourlyRates: {
        ASSOCIE: grille.ASSOCIE,
        MANAGER: grille.MANAGER,
        SENIOR: grille.SENIOR,
        JUNIOR: grille.JUNIOR,
        ASSISTANT: grille.ASSISTANT,
      },
      laborCostByGrade,
      laborCost,
      travelCost,
      otherCosts,
      baseCost,
      coefficientsApplied: coefs.map((c) => ({
        code: c.code,
        label: c.label,
        category: c.category,
        multiplier: c.multiplier,
      })),
      combinedMultiplier,
      adjustedCost,
      marginRates: { floor: floorMargin, target: targetMargin, ceiling: ceilingMargin },
      prices: {
        floor: Math.round(floorPrice),
        target: Math.round(targetPrice),
        ceiling: Math.round(ceilingPrice),
      },
      margins: {
        floor: Math.round(floorPrice - adjustedCost),
        target: Math.round(targetPrice - adjustedCost),
        ceiling: Math.round(ceilingPrice - adjustedCost),
      },
      budgetIndicative,
      budgetAlignmentPrice,
      budgetAlignmentIsWithinBounds,
      tenderRef: {
        id: tender.id,
        title: tender.title,
        clientName: tender.clientName,
        sector: tender.sector,
        submissionDeadline: tender.submissionDeadline,
      },
    };
  }

  /**
   * Simule + enrichit chaque scénario de prix avec une probabilité de gain estimée.
   */
  async simulateWithWinProbability(tenderId: string, dto: SimulatePricingDto) {
    const result = await this.simulate(tenderId, dto);
    const scenarios: Array<{
      label: string;
      price: number;
      margin: number;
      winProbability: Awaited<ReturnType<WinProbabilityService['estimate']>>;
    }> = [];

    for (const [label, price, margin] of [
      ['Plancher', result.prices.floor, result.margins.floor],
      ['Cible', result.prices.target, result.margins.target],
      ['Plafond', result.prices.ceiling, result.margins.ceiling],
    ] as const) {
      scenarios.push({
        label,
        price,
        margin,
        winProbability: await this.winProba.estimate(tenderId, price),
      });
    }

    if (result.budgetAlignmentPrice) {
      scenarios.push({
        label: 'Alignement budget',
        price: result.budgetAlignmentPrice,
        margin: Math.round(result.budgetAlignmentPrice - result.adjustedCost),
        winProbability: await this.winProba.estimate(tenderId, result.budgetAlignmentPrice),
      });
    }

    return { ...result, scenarios };
  }

  /**
   * Persiste une simulation comme snapshot nommé (ex: "v1", "après négo").
   */
  async save(tenderId: string, dto: SavePricingDto, userId: string) {
    const result = await this.simulate(tenderId, dto);

    const saved = await this.prisma.tenderPricing.create({
      data: {
        tenderId,
        name: dto.name,
        associeHours: dto.associeHours,
        managerHours: dto.managerHours,
        seniorHours: dto.seniorHours,
        juniorHours: dto.juniorHours,
        assistantHours: dto.assistantHours,
        travelCost: dto.travelCost ?? 0,
        otherCosts: dto.otherCosts ?? 0,
        otherCostsLabel: dto.otherCostsLabel,
        coefficientsSnapshot: result.coefficientsApplied as unknown as Prisma.InputJsonValue,
        floorMarginRate: result.marginRates.floor,
        targetMarginRate: result.marginRates.target,
        ceilingMarginRate: result.marginRates.ceiling,
        baseCost: result.baseCost,
        adjustedCost: result.adjustedCost,
        floorPrice: result.prices.floor,
        targetPrice: result.prices.target,
        ceilingPrice: result.prices.ceiling,
        currency: result.currency,
        notes: dto.notes,
        createdById: userId,
      },
    });

    return this.serializePricing(saved);
  }

  async list(tenderId: string) {
    await this.ensureTender(tenderId);
    const pricings = await this.prisma.tenderPricing.findMany({
      where: { tenderId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return pricings.map((p) => this.serializePricing(p));
  }

  async getById(id: string) {
    const p = await this.prisma.tenderPricing.findFirst({
      where: { id, tender: { cabinetId: TenantContext.tenantId() } },
      include: {
        tender: { select: { id: true, title: true, reference: true, clientName: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!p) throw new NotFoundException('Simulation introuvable');
    return this.serializePricing(p);
  }

  async delete(id: string) {
    const p = await this.prisma.tenderPricing.findFirst({
      where: { id, tender: { cabinetId: TenantContext.tenantId() } },
      select: { id: true },
    });
    if (!p) throw new NotFoundException('Simulation introuvable');
    await this.prisma.tenderPricing.delete({ where: { id } });
    return { deleted: true };
  }

  // ----- helpers privés -----

  private async ensureTender(tenderId: string) {
    const tender = await this.prisma.tender.findFirst({
      where: { id: tenderId, cabinetId: TenantContext.tenantId() },
    });
    if (!tender) throw new NotFoundException('AO introuvable');
    return tender;
  }

  /**
   * Retourne un dict {Grade: hourlyRate} pour les lignes de grille actives aujourd'hui.
   */
  private async getActiveGrille(cabinetId: string): Promise<Record<Grade, number>> {
    const today = new Date();
    const lines = await this.prisma.grilleHoraire.findMany({
      where: {
        cabinetId,
        effectiveFrom: { lte: today },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
      },
    });
    const grille: Record<Grade, number> = {
      ASSOCIE: 0,
      MANAGER: 0,
      SENIOR: 0,
      JUNIOR: 0,
      ASSISTANT: 0,
    };
    for (const line of lines) {
      grille[line.grade] = Number(line.hourlyRate);
    }
    const missing = (Object.keys(grille) as Grade[]).filter((g) => grille[g] === 0);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Grille horaire incomplète. Grades sans tarif actif: ${missing.join(', ')}`,
      );
    }
    return grille;
  }

  private serializePricing(p: any): any {
    return {
      ...p,
      associeHours: Number(p.associeHours),
      managerHours: Number(p.managerHours),
      seniorHours: Number(p.seniorHours),
      juniorHours: Number(p.juniorHours),
      assistantHours: Number(p.assistantHours),
      travelCost: Number(p.travelCost),
      otherCosts: Number(p.otherCosts),
      floorMarginRate: Number(p.floorMarginRate),
      targetMarginRate: Number(p.targetMarginRate),
      ceilingMarginRate: Number(p.ceilingMarginRate),
      baseCost: Number(p.baseCost),
      adjustedCost: Number(p.adjustedCost),
      floorPrice: Number(p.floorPrice),
      targetPrice: Number(p.targetPrice),
      ceilingPrice: Number(p.ceilingPrice),
    };
  }
}
