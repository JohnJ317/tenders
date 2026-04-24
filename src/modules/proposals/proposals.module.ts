import {
  Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post,
  Res, UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ProposalsService } from './proposals.service';
import { ProposalDocxService } from './proposal-docx.service';
import { ProposalTemplatesModule } from '../proposal-templates/proposal-templates.module';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { JwtPayload } from '../../common/tenant/tenant.middleware';

@Controller('tenders/:tenderId/proposal')
@UseGuards(RolesGuard)
export class ProposalsController {
  constructor(
    private readonly proposals: ProposalsService,
    private readonly docx: ProposalDocxService,
  ) {}

  /** GET : récupère la proposition (crée si n'existe pas) */
  @Get()
  get(
    @CurrentUser() user: JwtPayload,
    @Param('tenderId', ParseUUIDPipe) tenderId: string,
  ) {
    return this.proposals.getFullProposal(user.cabinetId, tenderId);
  }

  /** POST /generate/team : sélection équipe + références par Claude */
  @Post('generate/team')
  generateTeam(
    @CurrentUser() user: JwtPayload,
    @Param('tenderId', ParseUUIDPipe) tenderId: string,
  ) {
    return this.proposals.generateTeamAndRefs(user.cabinetId, tenderId);
  }

  /** POST /generate/methodology : rédige compréhension + méthodologie */
  @Post('generate/methodology')
  generateMethodology(
    @CurrentUser() user: JwtPayload,
    @Param('tenderId', ParseUUIDPipe) tenderId: string,
  ) {
    return this.proposals.generateMethodology(user.cabinetId, tenderId);
  }

  /** POST /generate/planning : rédige planning */
  @Post('generate/planning')
  generatePlanning(
    @CurrentUser() user: JwtPayload,
    @Param('tenderId', ParseUUIDPipe) tenderId: string,
  ) {
    return this.proposals.generatePlanning(user.cabinetId, tenderId);
  }

  /** PATCH /section/:name : édite manuellement une section */
  @Patch('section/:name')
  updateSection(
    @CurrentUser() user: JwtPayload,
    @Param('tenderId', ParseUUIDPipe) tenderId: string,
    @Param('name') name: 'understanding' | 'methodology' | 'planning',
    @Body() body: { content: string },
  ) {
    if (!['understanding', 'methodology', 'planning'].includes(name)) {
      throw new Error('Section invalide');
    }
    return this.proposals.updateSection(user.cabinetId, tenderId, name, body.content);
  }

  /** PATCH /team : édite l'équipe sélectionnée */
  @Patch('team')
  updateTeam(
    @CurrentUser() user: JwtPayload,
    @Param('tenderId', ParseUUIDPipe) tenderId: string,
    @Body() body: { team: any[] },
  ) {
    return this.proposals.updateTeam(user.cabinetId, tenderId, body.team);
  }

  /** PATCH /references : édite les références sélectionnées */
  @Patch('references')
  updateReferences(
    @CurrentUser() user: JwtPayload,
    @Param('tenderId', ParseUUIDPipe) tenderId: string,
    @Body() body: { references: any[] },
  ) {
    return this.proposals.updateReferences(user.cabinetId, tenderId, body.references);
  }

  /** PATCH /status : change le statut (DRAFT → READY → SUBMITTED) */
  @Patch('status')
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('tenderId', ParseUUIDPipe) tenderId: string,
    @Body() body: { status: 'DRAFT' | 'READY' | 'SUBMITTED' },
  ) {
    return this.proposals.updateStatus(user.cabinetId, tenderId, body.status);
  }

  /** GET /export.docx : télécharge la proposition en Word */
  @Get('export.docx')
  async exportDocx(
    @CurrentUser() user: JwtPayload,
    @Param('tenderId', ParseUUIDPipe) tenderId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.docx.generate(user.cabinetId, tenderId);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="proposition-${tenderId}.docx"`,
    );
    res.send(buffer);
  }
  /** POST /regenerate/team : régénération équipe+refs avec instruction utilisateur */
  @Post('regenerate/team')
  regenerateTeam(
    @CurrentUser() user: JwtPayload,
    @Param('tenderId', ParseUUIDPipe) tenderId: string,
    @Body() body: { instruction: string; targetedPassage?: string },
  ) {
    if (!body.instruction || !body.instruction.trim()) {
      throw new Error('Instruction requise');
    }
    return this.proposals.regenerateTeam(
      user.cabinetId, tenderId, body.instruction, body.targetedPassage,
    );
  }

  /** POST /regenerate/:section : régénère une section textuelle avec instruction */
  @Post('regenerate/:section')
  regenerateSection(
    @CurrentUser() user: JwtPayload,
    @Param('tenderId', ParseUUIDPipe) tenderId: string,
    @Param('section') section: 'understanding' | 'methodology' | 'planning',
    @Body() body: { instruction: string; targetedPassage?: string },
  ) {
    if (!['understanding', 'methodology', 'planning'].includes(section)) {
      throw new Error('Section invalide');
    }
    if (!body.instruction || !body.instruction.trim()) {
      throw new Error('Instruction requise');
    }
    return this.proposals.regenerateTextSection(
      user.cabinetId, tenderId, section as any, body.instruction, body.targetedPassage,
    );
  }


  /** PATCH /template : set the template for the proposal */
  @Patch('template')
  setTemplate(
    @CurrentUser() user: JwtPayload,
    @Param('tenderId', ParseUUIDPipe) tenderId: string,
    @Body() body: { templateCode: string },
  ) {
    return this.proposals.setTemplate(user.cabinetId, tenderId, body.templateCode);
  }

  /** PATCH /team-mode : change team selection mode (strict/complete) */
  @Patch('team-mode')
  setTeamMode(
    @CurrentUser() user: JwtPayload,
    @Param('tenderId', ParseUUIDPipe) tenderId: string,
    @Body() body: { mode: 'strict' | 'complete' },
  ) {
    return this.proposals.setTeamMode(user.cabinetId, tenderId, body.mode);
  }

  /** POST /pricing/generate : génère le breakdown pricing avec Claude */
  @Post('pricing/generate')
  generatePricing(
    @CurrentUser() user: JwtPayload,
    @Param('tenderId', ParseUUIDPipe) tenderId: string,
  ) {
    return this.proposals.generatePricingBreakdown(user.cabinetId, tenderId);
  }

  /** PATCH /pricing/cell : met à jour une cellule */
  @Patch('pricing/cell')
  updatePricingCell(
    @CurrentUser() user: JwtPayload,
    @Param('tenderId', ParseUUIDPipe) tenderId: string,
    @Body() body: { phaseIndex: number; grade: string; days: number },
  ) {
    return this.proposals.updatePricingCell(
      user.cabinetId, tenderId, body.phaseIndex, body.grade, body.days,
    );
  }

  /** PATCH /pricing/phase/:phaseIndex/validate : valide/invalide une phase */
  @Patch('pricing/phase/:phaseIndex/validate')
  validatePricingPhase(
    @CurrentUser() user: JwtPayload,
    @Param('tenderId', ParseUUIDPipe) tenderId: string,
    @Param('phaseIndex') phaseIndex: string,
    @Body() body: { validated: boolean },
  ) {
    return this.proposals.validatePricingPhase(
      user.cabinetId, tenderId, Number(phaseIndex), body.validated,
    );
  }

  /** POST /pricing/promote : crée un TenderPricing officiel */
  @Post('pricing/promote')
  promotePricing(
    @CurrentUser() user: JwtPayload,
    @Param('tenderId', ParseUUIDPipe) tenderId: string,
  ) {
    return this.proposals.promoteToTenderPricing(user.cabinetId, tenderId, user.sub);
  }

}

@Module({
  imports: [ProposalTemplatesModule],
  controllers: [ProposalsController],
  providers: [ProposalsService, ProposalDocxService],
  exports: [ProposalsService, ProposalDocxService],
})
export class ProposalsModule {}
