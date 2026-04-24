import { Module } from '@nestjs/common';
import {
  TenderDocumentsController,
  TenderTenderDocumentsController,
} from './tender-documents.controller';
import { TenderDocumentsService } from './tender-documents.service';

@Module({
  controllers: [TenderTenderDocumentsController, TenderDocumentsController],
  providers: [TenderDocumentsService],
  exports: [TenderDocumentsService],
})
export class TenderDocumentsModule {}
