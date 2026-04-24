import {
  Body, Controller, Get, Injectable, Logger, Module,
  Param, Patch, Put, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { J360AuthService } from './j360-auth.service';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { Role } from '@prisma/client';
import { JwtPayload } from '../../common/tenant/tenant.middleware';

export interface J360ConfigPayload {
  countries?: string[];
  tradeIds?: number[];
  announceTypes?: string[];
  isActive?: boolean;
  maxPagesPerRun?: number;
}

@Injectable()
export class J360Service {
  private readonly logger = new Logger(J360Service.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: J360AuthService,
  ) {}

  async getConfig(cabinetId: string) {
    let config = await this.prisma.j360Config.findUnique({ where: { cabinetId } });
    if (!config) {
      config = await this.prisma.j360Config.create({
        data: {
          cabinetId,
          countries: [],
          tradeIds: [],
          announceTypes: ['MC'],
          isActive: false,
        },
      });
    }
    return config;
  }

  async updateConfig(cabinetId: string, payload: J360ConfigPayload) {
    await this.getConfig(cabinetId);
    return this.prisma.j360Config.update({
      where: { cabinetId },
      data: {
        ...(payload.countries !== undefined && { countries: payload.countries }),
        ...(payload.tradeIds !== undefined && { tradeIds: payload.tradeIds }),
        ...(payload.announceTypes !== undefined && { announceTypes: payload.announceTypes }),
        ...(payload.isActive !== undefined && { isActive: payload.isActive }),
        ...(payload.maxPagesPerRun !== undefined && {
          maxPagesPerRun: Math.min(Math.max(1, payload.maxPagesPerRun), 20),
        }),
      },
    });
  }

  async listTrades() {
    return this.prisma.j360TradeCatalog.findMany({ orderBy: { name: 'asc' } });
  }

  async testAuth() {
    try {
      await this.auth.login();
      return { success: true, message: 'Login J360 réussi' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }
}

@Controller('j360')
@UseGuards(RolesGuard)
export class J360Controller {
  constructor(private readonly j360: J360Service) {}

  @Get('config')
  getConfig(@CurrentUser() user: JwtPayload) {
    return this.j360.getConfig(user.cabinetId);
  }

  @Put('config')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  updateConfig(
    @CurrentUser() user: JwtPayload,
    @Body() payload: J360ConfigPayload,
  ) {
    return this.j360.updateConfig(user.cabinetId, payload);
  }

  @Get('trades')
  listTrades() {
    return this.j360.listTrades();
  }

  @Patch('test-auth')
  @Roles(Role.ADMIN_CABINET)
  testAuth() {
    return this.j360.testAuth();
  }
}

@Module({
  controllers: [J360Controller],
  providers: [J360Service, J360AuthService],
  exports: [J360Service, J360AuthService],
})
export class J360Module {}
