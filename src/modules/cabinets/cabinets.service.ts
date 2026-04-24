import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { UpdateCabinetDto } from './dto/update-cabinet.dto';

@Injectable()
export class CabinetsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrent() {
    const tenantId = TenantContext.tenantId();
    const cabinet = await this.prisma.cabinet.findUnique({
      where: { id: tenantId },
      include: {
        activities: { where: { isActive: true } },
        grilleHoraire: {
          where: { effectiveTo: null },
          orderBy: { grade: 'asc' },
        },
        _count: { select: { users: true } },
      },
    });

    if (!cabinet) {
      throw new NotFoundException('Cabinet introuvable');
    }
    return cabinet;
  }

  async update(dto: UpdateCabinetDto) {
    const tenantId = TenantContext.tenantId();
    return this.prisma.cabinet.update({
      where: { id: tenantId },
      data: dto,
    });
  }
}