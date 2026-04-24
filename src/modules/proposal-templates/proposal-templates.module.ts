import {
  Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post, UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ProposalTemplatesService } from './proposal-templates.service';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { JwtPayload } from '../../common/tenant/tenant.middleware';

@Controller('proposal-templates')
@UseGuards(RolesGuard)
export class ProposalTemplatesController {
  constructor(private readonly service: ProposalTemplatesService) {}

  /** Liste tous les templates du cabinet (initialise les 6 par défaut si aucun) */
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.service.list(user.cabinetId);
  }

  /** Met à jour un template (admin cabinet uniquement) */
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: any,
  ) {
    if (!['ADMIN_CABINET', 'ASSOCIE'].includes(user.role)) {
      throw new ForbiddenException('Seuls les administrateurs peuvent modifier les templates');
    }
    return this.service.update(user.cabinetId, id, body);
  }

  /** Réinitialise un template à sa valeur par défaut */
  @Post(':id/reset')
  reset(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!['ADMIN_CABINET', 'ASSOCIE'].includes(user.role)) {
      throw new ForbiddenException('Seuls les administrateurs peuvent réinitialiser les templates');
    }
    return this.service.resetToDefault(user.cabinetId, id);
  }

  /** Suggère les meilleurs templates pour un AO donné (utilise Claude) */
  @Post('suggest/:tenderId')
  suggest(
    @CurrentUser() user: JwtPayload,
    @Param('tenderId', ParseUUIDPipe) tenderId: string,
  ) {
    return this.service.suggestForTender(user.cabinetId, tenderId);
  }
}

@Module({
  controllers: [ProposalTemplatesController],
  providers: [ProposalTemplatesService],
  exports: [ProposalTemplatesService],
})
export class ProposalTemplatesModule {}
