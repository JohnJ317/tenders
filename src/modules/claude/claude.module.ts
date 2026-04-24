import {
  Controller, Get, Post, Param, UseGuards, Module, BadRequestException,
} from '@nestjs/common';
import { ClaudeService } from './claude.service';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { Role } from '@prisma/client';
import { StorageModule } from '../../common/storage/storage.module';

@Controller('tenders/:tenderId/analysis')
@UseGuards(RolesGuard)
export class TenderAnalysisController {
  constructor(private readonly claude: ClaudeService) {}

  /** Récupère l'analyse existante (ou null si pas encore faite). */
  @Get()
  async get(@Param('tenderId') tenderId: string) {
    return this.claude.getAnalysis(tenderId);
  }

  /** Lance (ou relance) l'analyse Claude de cet AO. */
  @Post()
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  async analyze(@Param('tenderId') tenderId: string) {
    return this.claude.analyzeTender(tenderId);
  }
}

@Module({
  imports: [StorageModule],
  controllers: [TenderAnalysisController],
  providers: [ClaudeService],
  exports: [ClaudeService],
})
export class ClaudeModule {}
