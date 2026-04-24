import { Module, forwardRef } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [forwardRef(() => AlertsModule)],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
