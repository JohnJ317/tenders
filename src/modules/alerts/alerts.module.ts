import {
  Controller, Delete, Get, Module, Param, ParseUUIDPipe,
  Patch, Query, UseGuards,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { EmailService } from './email.service';
import { RolesGuard } from '../../common/auth/roles.guard';

@Controller('alerts')
@UseGuards(RolesGuard)
export class AlertsController {
  constructor(private readonly service: AlertsService) {}

  @Get()
  list(@Query('filter') filter?: 'unread' | 'all') {
    return this.service.listForCabinet(filter);
  }

  @Get('unread-count')
  async unreadCount() {
    const count = await this.service.unreadCount();
    return { count };
  }

  @Patch(':id/read')
  markRead(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.markRead(id);
  }

  @Patch('mark-all-read')
  markAllRead() { return this.service.markAllRead(); }

  @Delete(':id')
  dismiss(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.dismiss(id);
  }
}

@Module({
  controllers: [AlertsController],
  providers: [AlertsService, EmailService],
  exports: [AlertsService, EmailService],
})
export class AlertsModule {}
