import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { CabinetsService } from './cabinets.service';
import { UpdateCabinetDto } from './dto/update-cabinet.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtPayload } from '../../common/tenant/tenant.middleware';

@Controller('cabinets')
@UseGuards(RolesGuard)
export class CabinetsController {
  constructor(private readonly cabinetsService: CabinetsService) {}

  /** GET /cabinets/me — tous rôles authentifiés */
  @Get('me')
  async getCurrent(@CurrentUser() user: JwtPayload) {
    return this.cabinetsService.getCurrent();
  }

  /** PATCH /cabinets/me — admin/associé/manager */
  @Patch('me')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  async update(@Body() dto: UpdateCabinetDto) {
    return this.cabinetsService.update(dto);
  }

  /** POST /cabinets/me/logo — upload logo */
  @Post('me/logo')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(@UploadedFile() file: any) {
    if (!file) {
      throw new Error('Aucun fichier reçu');
    }
    return this.cabinetsService.uploadLogo(file.buffer, file.mimetype, file.originalname);
  }

  /** DELETE /cabinets/me/logo — supprime le logo */
  @Delete('me/logo')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  async deleteLogo() {
    return this.cabinetsService.deleteLogo();
  }

  /** POST /cabinets/me/activities — ajoute une activité */
  @Post('me/activities')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  async addActivity(@Body() dto: CreateActivityDto) {
    return this.cabinetsService.addActivity(dto);
  }

  /** DELETE /cabinets/me/activities/:id — supprime une activité */
  @Delete('me/activities/:id')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  async removeActivity(@Param('id') id: string) {
    return this.cabinetsService.removeActivity(id);
  }
}
