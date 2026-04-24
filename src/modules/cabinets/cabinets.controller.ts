import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CabinetsService } from './cabinets.service';
import { UpdateCabinetDto } from './dto/update-cabinet.dto';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtPayload } from '../../common/tenant/tenant.middleware';

@Controller('cabinets')
@UseGuards(RolesGuard)
export class CabinetsController {
  constructor(private readonly cabinetsService: CabinetsService) {}

  /**
   * GET /cabinets/me
   * Retourne le cabinet courant + config (tous rôles authentifiés).
   */
  @Get('me')
  async getCurrent(@CurrentUser() user: JwtPayload) {
    return this.cabinetsService.getCurrent();
  }

  /**
   * PATCH /cabinets/me
   * Met à jour les paramètres du cabinet. Réservé à admin cabinet + associé.
   */
  @Patch('me')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE)
  async update(@Body() dto: UpdateCabinetDto) {
    return this.cabinetsService.update(dto);
  }
}
