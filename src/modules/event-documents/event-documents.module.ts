import { Module } from '@nestjs/common';
import {
  EventDocumentsController,
  EventEventDocumentsController,
} from './event-documents.controller';
import { EventDocumentsService } from './event-documents.service';

@Module({
  controllers: [EventEventDocumentsController, EventDocumentsController],
  providers: [EventDocumentsService],
  exports: [EventDocumentsService],
})
export class EventDocumentsModule {}
