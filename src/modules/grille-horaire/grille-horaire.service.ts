import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import {
  CreateGrilleHoraireDto,
  UpdateGrilleHoraireDto,
} from './dto/grille-horaire.dto';

@Injectable()
export class GrilleHoraireService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lignes actuellement en vigueur (effectiveTo null ou >= today) */
  listActive() {
    const today = new Date();
    return this.prisma.grilleHoraire.findMany({
      where: {
        effectiveFrom: { lte: today },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
      },
      orderBy: { grade: 'asc' },
    });
  }

  /** Historique complet */
  listAll() {
    return this.prisma.grilleHoraire.findMany({
      orderBy: [{ effectiveFrom: 'desc' }, { grade: 'asc' }],
    });
  }

  async getById(id: string) {
    const line = await this.prisma.grilleHoraire.findUnique({ where: { id } });
    if (!line) throw new NotFoundException('Ligne de grille introuvable');
    return line;
  }

  /**
   * Ajoute une nouvelle ligne. Si une ligne active existe déjà pour ce grade,
   * on ferme son effectiveTo la veille de la nouvelle effectiveFrom.
   */
  async create(dto: CreateGrilleHoraireDto) {
    const tenantId = TenantContext.tenantId();

    return this.prisma.$transaction(async (tx) => {
      // Re-set le tenant context dans la transaction (le middleware Prisma ne
      // s'applique pas aux appels via tx directement).
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_tenant_id', $1, true)`,
        tenantId,
      );

      // Clôture de la ligne active précédente pour ce grade
      const previous = await tx.grilleHoraire.findFirst({
        where: {
          grade: dto.grade,
          effectiveTo: null,
        },
      });
      if (previous) {
        const previousEnd = new Date(dto.effectiveFrom);
        previousEnd.setDate(previousEnd.getDate() - 1);
        await tx.grilleHoraire.update({
          where: { id: previous.id },
          data: { effectiveTo: previousEnd },
        });
      }

      return tx.grilleHoraire.create({
        data: {
          grade: dto.grade,
          hourlyRate: dto.hourlyRate,
          dailyRate: dto.dailyRate,
          effectiveFrom: dto.effectiveFrom,
          effectiveTo: dto.effectiveTo,
          cabinet: { connect: { id: tenantId } },
        },
      });
    });
  }

  async update(id: string, dto: UpdateGrilleHoraireDto) {
    try {
      return await this.prisma.grilleHoraire.update({ where: { id }, data: dto });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Ligne de grille introuvable');
      }
      throw e;
    }
  }
}
