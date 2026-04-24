import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { WinProbabilityService } from './win-probability.service';
import { PricingPdfService } from './pdf-generator.service';
import {
  TenderPricingController,
  TenderPricingDetailController,
} from './pricing.controller';
import { PricingCoefficientsModule } from '../pricing-coefficients/pricing-coefficients.module';

@Module({
  imports: [PricingCoefficientsModule],
  controllers: [TenderPricingController, TenderPricingDetailController],
  providers: [PricingService, WinProbabilityService, PricingPdfService],
  exports: [PricingService, WinProbabilityService],
})
export class PricingModule {}
