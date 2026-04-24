import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { GrilleHoraireService } from './grille-horaire.service';
import {
  CreateGrilleHoraireDto,
  UpdateGrilleHoraireDto,
} from './dto/grille-horaire.dto';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';

@Controller('grille-horaire')
@UseGuards(RolesGuard)
export class GrilleHoraireController {
  constructor(private readonly service: GrilleHoraireService) {}

  @Get()
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER, Role.CONSULTANT)
  list(@Query('history') history?: string) {
    return history === 'true' ? this.service.listAll() : this.service.listActive();
  }

  @Get(':id')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER, Role.CONSULTANT)
  getById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getById(id);
  }

  @Post()
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  create(@Body() dto: CreateGrilleHoraireDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateGrilleHoraireDto,
  ) {
    return this.service.update(id, dto);
  }
}
