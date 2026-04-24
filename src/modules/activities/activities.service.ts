import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { CreateActivityDto, UpdateActivityDto } from './dto/activity.dto';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  list(includeInactive = false) {
    return this.prisma.activity.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { type: 'asc' },
    });
  }

  async getById(id: string) {
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException('Activité introuvable');
    return activity;
  }

  create(dto: CreateActivityDto) {
    return this.prisma.activity.create({
      data: {
        type: dto.type,
        label: dto.label,
        isActive: dto.isActive ?? true,
        cabinet: { connect: { id: TenantContext.tenantId() } },
      },
    });
  }

  async update(id: string, dto: UpdateActivityDto) {
    try {
      return await this.prisma.activity.update({ where: { id }, data: dto });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Activité introuvable');
      }
      throw e;
    }
  }

  /** Soft delete via isActive = false */
  deactivate(id: string) {
    return this.update(id, { isActive: false });
  }
}
