import { Module } from '@nestjs/common';
import {
  CompetitiveIntelController,
  TenderCompetitiveIntelController,
} from './competitive-intel.controller';
import { CompetitiveIntelService } from './competitive-intel.service';

@Module({
  controllers: [TenderCompetitiveIntelController, CompetitiveIntelController],
  providers: [CompetitiveIntelService],
  exports: [CompetitiveIntelService],
})
export class CompetitiveIntelModule {}
