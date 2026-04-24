import {
  Body, Controller, Delete, Get, Module, Param, ParseUUIDPipe, Patch, Post,
  Query, UseGuards, Injectable, BadRequestException,
} from '@nestjs/common';
import { ReferenceStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { JwtPayload } from '../../common/tenant/tenant.middleware';

interface CreateReferenceDto {
  projectName: string;
  clientName: string;
  country?: string;
  sector?: string;
  description: string;
  outcome?: string;
  budget?: number;
  currency?: string;
  startDate?: string;
  endDate?: string;
  durationMonths?: number;
  status?: ReferenceStatus;
  tags?: string[];
  memberIds?: Array<{ consultantId: string; role?: string }>;
}

interface UpdateReferenceDto extends Partial<CreateReferenceDto> {}

@Injectable()
export class ReferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(cabinetId: string, opts: {
    search?: string; status?: string; sector?: string; country?: string;
  }) {
    const where: any = { cabinetId };
    if (opts.status && ['COMPLETED', 'ONGOING', 'LOST', 'ARCHIVED'].includes(opts.status)) {
      where.status = opts.status;
    }
    if (opts.sector) where.sector = { contains: opts.sector, mode: 'insensitive' };
    if (opts.country) where.country = opts.country;
    if (opts.search) {
      where.OR = [
        { projectName: { contains: opts.search, mode: 'insensitive' } },
        { clientName: { contains: opts.search, mode: 'insensitive' } },
        { description: { contains: opts.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.reference.findMany({
      where,
      orderBy: [{ endDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        members: {
          include: {
            consultant: {
              select: { id: true, fullName: true, title: true, kind: true },
            },
          },
        },
      },
    });
  }

  async findById(cabinetId: string, id: string) {
    const ref = await this.prisma.reference.findFirst({
      where: { id, cabinetId },
      include: {
        members: {
          include: {
            consultant: {
              select: {
                id: true, fullName: true, title: true, kind: true,
                yearsExperience: true, skills: true,
              },
            },
          },
        },
      },
    });
    if (!ref) throw new BadRequestException('Référence introuvable');
    return ref;
  }

  async create(cabinetId: string, dto: CreateReferenceDto) {
    if (!dto.projectName) throw new BadRequestException('Nom du projet requis');
    if (!dto.clientName) throw new BadRequestException('Client requis');
    if (!dto.description) throw new BadRequestException('Description requise');

    return this.prisma.reference.create({
      data: {
        cabinetId,
        projectName: dto.projectName,
        clientName: dto.clientName,
        country: dto.country,
        sector: dto.sector,
        description: dto.description,
        outcome: dto.outcome,
        budget: dto.budget,
        currency: dto.currency ?? 'XOF',
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        durationMonths: dto.durationMonths,
        status: dto.status ?? 'COMPLETED',
        tags: dto.tags ?? [],
        members: dto.memberIds && dto.memberIds.length > 0
          ? {
              create: dto.memberIds.map((m) => ({
                consultantId: m.consultantId,
                role: m.role,
              })),
            }
          : undefined,
      },
      include: {
        members: {
          include: {
            consultant: { select: { id: true, fullName: true, title: true } },
          },
        },
      },
    });
  }

  async update(cabinetId: string, id: string, dto: UpdateReferenceDto) {
    await this.findById(cabinetId, id);

    // Si memberIds fourni, on remplace tous les membres
    const memberUpdate = dto.memberIds
      ? {
          deleteMany: {},
          create: dto.memberIds.map((m) => ({
            consultantId: m.consultantId,
            role: m.role,
          })),
        }
      : undefined;

    const { memberIds, ...rest } = dto;
    return this.prisma.reference.update({
      where: { id },
      data: {
        ...rest,
        startDate: rest.startDate ? new Date(rest.startDate) : undefined,
        endDate: rest.endDate ? new Date(rest.endDate) : undefined,
        members: memberUpdate,
      } as any,
      include: {
        members: {
          include: {
            consultant: { select: { id: true, fullName: true, title: true } },
          },
        },
      },
    });
  }

  async remove(cabinetId: string, id: string) {
    await this.findById(cabinetId, id);
    return this.prisma.reference.delete({ where: { id } });
  }

  /** Statistiques utilisées sur la page /references */
  async stats(cabinetId: string) {
    const [total, byStatus, bySector] = await Promise.all([
      this.prisma.reference.count({ where: { cabinetId } }),
      this.prisma.reference.groupBy({
        by: ['status'],
        where: { cabinetId },
        _count: true,
      }),
      this.prisma.reference.groupBy({
        by: ['sector'],
        where: { cabinetId, sector: { not: null } },
        _count: true,
        orderBy: { _count: { sector: 'desc' } },
        take: 5,
      }),
    ]);
    return { total, byStatus, bySector };
  }
}

@Controller('references')
@UseGuards(RolesGuard)
export class ReferencesController {
  constructor(private readonly service: ReferencesService) {}

  @Get('stats')
  stats(@CurrentUser() user: JwtPayload) {
    return this.service.stats(user.cabinetId);
  }

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('sector') sector?: string,
    @Query('country') country?: string,
  ) {
    return this.service.list(user.cabinetId, { search, status, sector, country });
  }

  @Get(':id')
  findById(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findById(user.cabinetId, id);
  }

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateReferenceDto,
  ) {
    return this.service.create(user.cabinetId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReferenceDto,
  ) {
    return this.service.update(user.cabinetId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(user.cabinetId, id);
  }
}

@Module({
  controllers: [ReferencesController],
  providers: [ReferencesService],
  exports: [ReferencesService],
})
export class ReferencesModule {}
