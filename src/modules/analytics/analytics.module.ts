import {
  Controller, Get, Module, Query, UseGuards,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { JwtPayload } from '../../common/tenant/tenant.middleware';

@Controller('analytics')
@UseGuards(RolesGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('kpis')
  getKpis(
    @CurrentUser() user: JwtPayload,
    @Query('period') period = '90d',
  ) {
    return this.analytics.getKpis(user.cabinetId, period);
  }

  @Get('funnel')
  getFunnel(
    @CurrentUser() user: JwtPayload,
    @Query('period') period = '90d',
  ) {
    return this.analytics.getFunnel(user.cabinetId, period);
  }

  @Get('segments')
  getSegments(
    @CurrentUser() user: JwtPayload,
    @Query('period') period = '90d',
    @Query('by') by: 'country' | 'sector' | 'source' = 'country',
  ) {
    return this.analytics.getSegments(user.cabinetId, period, by);
  }

  @Get('timeseries')
  getTimeseries(
    @CurrentUser() user: JwtPayload,
    @Query('period') period = '90d',
  ) {
    return this.analytics.getTimeseries(user.cabinetId, period);
  }
}

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
