import {
  Body, Controller, Delete, Get, Injectable, Module,
  NotFoundException, Param, ParseUUIDPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { Role } from '@prisma/client';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CreateWatchDomainDto, UpdateWatchDomainDto } from './dto/watch-domain.dto';

@Injectable()
export class WatchDomainsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.watchDomain.findMany({
      where: { cabinetId: TenantContext.tenantId() },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string) {
    const w = await this.prisma.watchDomain.findFirst({
      where: { id, cabinetId: TenantContext.tenantId() },
    });
    if (!w) throw new NotFoundException('Domaine de veille introuvable');
    return w;
  }

  create(dto: CreateWatchDomainDto) {
    return this.prisma.watchDomain.create({
      data: { ...dto, cabinetId: TenantContext.tenantId() },
    });
  }

  async update(id: string, dto: UpdateWatchDomainDto) {
    await this.getById(id);
    return this.prisma.watchDomain.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    await this.getById(id);
    await this.prisma.watchDomain.delete({ where: { id } });
    return { deleted: true };
  }
}

@Controller('watch-domains')
@UseGuards(RolesGuard)
export class WatchDomainsController {
  constructor(private readonly service: WatchDomainsService) {}

  @Get()
  list() { return this.service.list(); }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getById(id);
  }

  @Post()
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  create(@Body() dto: CreateWatchDomainDto) { return this.service.create(dto); }

  @Patch(':id')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateWatchDomainDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  delete(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.delete(id);
  }
}

@Module({
  controllers: [WatchDomainsController],
  providers: [WatchDomainsService],
  exports: [WatchDomainsService],
})
export class WatchDomainsModule {}
