import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import {
  CreateTenderDto,
  ListTendersDto,
  TransitionTenderDto,
  UpdateTenderDto,
} from './dto/tender.dto';
import {
  allowedTransitions,
  canTransition,
  isFinalStage,
  TENDER_CLOSED_STAGES,
} from './state-machine/tender-transitions';

@Injectable()
export class TendersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: ListTendersDto) {
    const where: Prisma.TenderWhereInput = {
      cabinetId: TenantContext.tenantId(),
    };

    if (filters.stage) where.stage = filters.stage;
    if (filters.source) where.source = filters.source;
    if (filters.leadUserId) where.leadUserId = filters.leadUserId;
    if (filters.isOpen !== undefined) where.isOpen = filters.isOpen;

    return this.prisma.tender.findMany({
      where,
      include: {
        leadUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: { select: { transitions: true } },
      },
      orderBy: [{ isOpen: 'desc' }, { submissionDeadline: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getById(id: string) {
    const tender = await this.prisma.tender.findFirst({
      where: { id, cabinetId: TenantContext.tenantId() },
      include: {
        leadUser: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        transitions: {
          orderBy: { performedAt: 'desc' },
          include: {
            performedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!tender) throw new NotFoundException('AO introuvable');
    return {
      ...tender,
      _meta: {
        allowedTransitions: allowedTransitions(tender.stage),
        isFinal: isFinalStage(tender.stage),
      },
    };
  }

  async create(dto: CreateTenderDto, userId: string) {
    const tenantId = TenantContext.tenantId();
    const cabinet = await this.prisma.cabinet.findUnique({
      where: { id: tenantId },
      select: { currency: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const tender = await tx.tender.create({
        data: {
          ...dto,
          cabinetId: tenantId,
          createdById: userId,
          currency: cabinet?.currency ?? 'XOF',
          stage: 'WATCHING',
          isOpen: true,
        },
        include: {
          leadUser: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await tx.tenderTransition.create({
        data: {
          tenderId: tender.id,
          fromStage: null,
          toStage: 'WATCHING',
          note: "Création de l'opportunité",
          performedById: userId,
        },
      });

      return tender;
    });
  }

  async update(id: string, dto: UpdateTenderDto) {
    await this.getById(id);

    try {
      return await this.prisma.tender.update({
        where: { id },
        data: { ...dto },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('AO introuvable');
      }
      throw e;
    }
  }

  async delete(id: string) {
    await this.getById(id);
    await this.prisma.tender.delete({ where: { id } });
    return { deleted: true };
  }

  async transition(id: string, dto: TransitionTenderDto, userId: string) {
    const current = await this.prisma.tender.findFirst({
      where: { id, cabinetId: TenantContext.tenantId() },
      select: { id: true, stage: true },
    });
    if (!current) throw new NotFoundException('AO introuvable');

    if (!canTransition(current.stage, dto.toStage)) {
      throw new BadRequestException(
        `Transition invalide: ${current.stage} → ${dto.toStage}. ` +
        `Transitions autorisées: ${allowedTransitions(current.stage).join(', ') || '(aucune, état final)'}`,
      );
    }

    if (dto.toStage === 'WON' && !dto.wonAmount) {
      throw new BadRequestException('Le montant signé (wonAmount) est requis pour passer à WON');
    }
    if (dto.toStage === 'LOST' && !dto.lostReason) {
      throw new BadRequestException('La raison de perte (lostReason) est requise pour passer à LOST');
    }

    const nextIsOpen = !TENDER_CLOSED_STAGES.includes(dto.toStage);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tender.update({
        where: { id },
        data: {
          stage: dto.toStage,
          isOpen: nextIsOpen,
          wonAmount: dto.toStage === 'WON' ? dto.wonAmount : undefined,
          lostReason: dto.toStage === 'LOST' ? dto.lostReason : undefined,
        },
      });

      await tx.tenderTransition.create({
        data: {
          tenderId: id,
          fromStage: current.stage,
          toStage: dto.toStage,
          note: dto.note,
          performedById: userId,
        },
      });

      return updated;
    });
  }

  async getHistory(id: string) {
    await this.getById(id);

    return this.prisma.tenderTransition.findMany({
      where: { tenderId: id },
      orderBy: { performedAt: 'desc' },
      include: {
        performedBy: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
    });
  }
}
