import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { TendersService } from './tenders.service';
import {
  CreateTenderDto,
  ListTendersDto,
  TransitionTenderDto,
  UpdateTenderDto,
} from './dto/tender.dto';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtPayload } from '../../common/tenant/tenant.middleware';

@Controller('tenders')
@UseGuards(RolesGuard)
export class TendersController {
  constructor(private readonly tendersService: TendersService) {}

  @Get()
  list(@Query() filters: ListTendersDto) {
    return this.tendersService.list(filters);
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.tendersService.getById(id);
  }

  @Get(':id/history')
  getHistory(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.tendersService.getHistory(id);
  }

  @Post()
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  create(@Body() dto: CreateTenderDto, @CurrentUser() user: JwtPayload) {
    return this.tendersService.create(dto, user.sub);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTenderDto,
  ) {
    return this.tendersService.update(id, dto);
  }

  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  transition(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: TransitionTenderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tendersService.transition(id, dto, user.sub);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  delete(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.tendersService.delete(id);
  }
}
