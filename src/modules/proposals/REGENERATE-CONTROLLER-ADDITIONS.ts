// ============================================================
// CONTROLLER ADDITIONS
// À ajouter dans proposals.module.ts, dans la classe ProposalsController
// juste avant la dernière accolade `}` de la classe
// ============================================================

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
