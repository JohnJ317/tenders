import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CompetitiveIntelService } from './competitive-intel.service';
import {
  CreateCompetitiveIntelDto,
  UpdateCompetitiveIntelDto,
} from './dto/competitive-intel.dto';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtPayload } from '../../common/tenant/tenant.middleware';

/** /api/tenders/:tenderId/competitive-intel */
@Controller('tenders/:tenderId/competitive-intel')
@UseGuards(RolesGuard)
export class TenderCompetitiveIntelController {
  constructor(private readonly service: CompetitiveIntelService) {}

  @Get()
  list(@Param('tenderId', new ParseUUIDPipe()) tenderId: string) {
    return this.service.list(tenderId);
  }

  @Post()
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  create(
    @Param('tenderId', new ParseUUIDPipe()) tenderId: string,
    @Body() dto: CreateCompetitiveIntelDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(tenderId, dto, user.sub);
  }
}

/** /api/competitive-intel/:id + /api/competitive-intel/stats/competitors */
@Controller('competitive-intel')
@UseGuards(RolesGuard)
export class CompetitiveIntelController {
  constructor(private readonly service: CompetitiveIntelService) {}

  @Get('stats/competitors')
  competitorStats() {
    return this.service.competitorStats();
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCompetitiveIntelDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  delete(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.delete(id);
  }
}
