import { Module } from '@nestjs/common';
import { PricingCoefficientsController } from './pricing-coefficients.controller';
import { PricingCoefficientsService } from './pricing-coefficients.service';

@Module({
  controllers: [PricingCoefficientsController],
  providers: [PricingCoefficientsService],
  exports: [PricingCoefficientsService],
})
export class PricingCoefficientsModule {}
