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
import { EventsService } from './events.service';
import {
  CreateEventDto,
  ListEventsDto,
  TransitionEventDto,
  UpdateEventDto,
} from './dto/event.dto';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtPayload } from '../../common/tenant/tenant.middleware';

@Controller('events')
@UseGuards(RolesGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  list(@Query() filters: ListEventsDto) {
    return this.eventsService.list(filters);
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.eventsService.getById(id);
  }

  @Get(':id/history')
  getHistory(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.eventsService.getHistory(id);
  }

  @Post()
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  create(@Body() dto: CreateEventDto, @CurrentUser() user: JwtPayload) {
    return this.eventsService.create(dto, user.sub);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(id, dto);
  }

  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  transition(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: TransitionEventDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.eventsService.transition(id, dto, user.sub);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  delete(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.eventsService.delete(id);
  }
}
