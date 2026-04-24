import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PricingCoefficientCategory } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import {
  CreateCoefficientDto,
  UpdateCoefficientDto,
} from './dto/pricing-coefficient.dto';
import { DEFAULT_COEFFICIENTS } from './default-coefficients';

@Injectable()
export class PricingCoefficientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(category?: PricingCoefficientCategory, includeInactive = false) {
    const where: Prisma.PricingCoefficientWhereInput = {
      cabinetId: TenantContext.tenantId(),
    };
    if (category) where.category = category;
    if (!includeInactive) where.isActive = true;

    const coefficients = await this.prisma.pricingCoefficient.findMany({
      where,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });

    return coefficients.map((c) => ({ ...c, multiplier: Number(c.multiplier) }));
  }

  /** Groupés par catégorie pour l'UI */
  async listGrouped() {
    const all = await this.list();
    const grouped: Record<string, typeof all> = {};
    for (const c of all) {
      if (!grouped[c.category]) grouped[c.category] = [];
      grouped[c.category].push(c);
    }
    return grouped;
  }

  async getById(id: string) {
    const coef = await this.prisma.pricingCoefficient.findFirst({
      where: { id, cabinetId: TenantContext.tenantId() },
    });
    if (!coef) throw new NotFoundException('Coefficient introuvable');
    return { ...coef, multiplier: Number(coef.multiplier) };
  }

  async getByCodes(codes: string[]) {
    if (codes.length === 0) return [];
    const coefs = await this.prisma.pricingCoefficient.findMany({
      where: {
        cabinetId: TenantContext.tenantId(),
        code: { in: codes },
        isActive: true,
      },
    });
    return coefs.map((c) => ({ ...c, multiplier: Number(c.multiplier) }));
  }

  async create(dto: CreateCoefficientDto) {
    try {
      const created = await this.prisma.pricingCoefficient.create({
        data: {
          ...dto,
          cabinetId: TenantContext.tenantId(),
          isSystem: false,
        },
      });
      return { ...created, multiplier: Number(created.multiplier) };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException(`Code "${dto.code}" déjà utilisé dans ce cabinet`);
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateCoefficientDto) {
    await this.getById(id); // ownership check
    const updated = await this.prisma.pricingCoefficient.update({
      where: { id },
      data: dto,
    });
    return { ...updated, multiplier: Number(updated.multiplier) };
  }

  async delete(id: string) {
    const coef = await this.getById(id);
    if (coef.isSystem) {
      throw new ForbiddenException(
        'Impossible de supprimer un coefficient système. Désactivez-le plutôt (isActive = false).',
      );
    }
    await this.prisma.pricingCoefficient.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Initialise les coefficients système pour un nouveau cabinet.
   * Appelé une seule fois à la création du cabinet (ou manuellement pour migrer).
   */
  async seedDefaultsForCabinet(cabinetId: string) {
    const existing = await this.prisma.pricingCoefficient.count({
      where: { cabinetId, isSystem: true },
    });
    if (existing > 0) return { seeded: 0, skipped: 'already seeded' };

    await this.prisma.pricingCoefficient.createMany({
      data: DEFAULT_COEFFICIENTS.map((c) => ({
        ...c,
        cabinetId,
        isSystem: true,
        isActive: true,
      })),
      skipDuplicates: true,
    });

    return { seeded: DEFAULT_COEFFICIENTS.length };
  }
}
