import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import {
  CreateEventDto,
  ListEventsDto,
  TransitionEventDto,
  UpdateEventDto,
} from './dto/event.dto';
import {
  allowedTransitions,
  canTransition,
  isFinalStage,
} from './state-machine/event-transitions';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: ListEventsDto) {
    const where: Prisma.EventWhereInput = {
      cabinetId: TenantContext.tenantId(),
    };
    if (filters.stage) where.stage = filters.stage;
    if (filters.type) where.type = filters.type;
    if (filters.leadUserId) where.leadUserId = filters.leadUserId;

    return this.prisma.event.findMany({
      where,
      include: {
        leadUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: { select: { transitions: true } },
      },
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getById(id: string) {
    const event = await this.prisma.event.findFirst({
      where: { id, cabinetId: TenantContext.tenantId() },
      include: {
        leadUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
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

    if (!event) throw new NotFoundException('Manifestation introuvable');
    return {
      ...event,
      _meta: {
        allowedTransitions: allowedTransitions(event.stage),
        isFinal: isFinalStage(event.stage),
      },
    };
  }

  async create(dto: CreateEventDto, userId: string) {
    const tenantId = TenantContext.tenantId();
    const cabinet = await this.prisma.cabinet.findUnique({
      where: { id: tenantId },
      select: { currency: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          ...dto,
          cabinetId: tenantId,
          createdById: userId,
          currency: cabinet?.currency ?? 'XOF',
          stage: 'IDENTIFIED',
        },
      });

      await tx.eventTransition.create({
        data: {
          eventId: event.id,
          fromStage: null,
          toStage: 'IDENTIFIED',
          note: 'Création de la manifestation',
          performedById: userId,
        },
      });

      return event;
    });
  }

  async update(id: string, dto: UpdateEventDto) {
    await this.getById(id);
    try {
      return await this.prisma.event.update({
        where: { id },
        data: { ...dto },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Manifestation introuvable');
      }
      throw e;
    }
  }

  async delete(id: string) {
    await this.getById(id);
    await this.prisma.event.delete({ where: { id } });
    return { deleted: true };
  }

  async transition(id: string, dto: TransitionEventDto, userId: string) {
    const current = await this.prisma.event.findFirst({
      where: { id, cabinetId: TenantContext.tenantId() },
      select: { id: true, stage: true },
    });
    if (!current) throw new NotFoundException('Manifestation introuvable');

    if (!canTransition(current.stage, dto.toStage)) {
      throw new BadRequestException(
        `Transition invalide: ${current.stage} → ${dto.toStage}. ` +
        `Transitions autorisées: ${allowedTransitions(current.stage).join(', ') || '(aucune, état final)'}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.event.update({
        where: { id },
        data: { stage: dto.toStage },
      });

      await tx.eventTransition.create({
        data: {
          eventId: id,
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
    return this.prisma.eventTransition.findMany({
      where: { eventId: id },
      orderBy: { performedAt: 'desc' },
      include: {
        performedBy: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
    });
  }
}
