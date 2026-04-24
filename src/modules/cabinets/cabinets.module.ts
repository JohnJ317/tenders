import { StorageModule } from '../../common/storage/storage.module';
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CabinetsController } from './cabinets.controller';
import { CabinetsService } from './cabinets.service';

@Module({
  imports: [StorageModule, MulterModule.register({ storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } })],
  controllers: [CabinetsController],
  providers: [CabinetsService],
  exports: [CabinetsService],
})
export class CabinetsModule {}
