import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { TenderDocumentsService } from './tender-documents.service';
import {
  UpdateTenderDocumentDto,
  UploadTenderDocumentDto,
} from './dto/tender-document.dto';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtPayload } from '../../common/tenant/tenant.middleware';

/**
 * Endpoints liés à un AO parent (liste + upload).
 * Route: /api/tenders/:tenderId/documents
 */
@Controller('tenders/:tenderId/documents')
@UseGuards(RolesGuard)
export class TenderTenderDocumentsController {
  constructor(private readonly service: TenderDocumentsService) {}

  @Get()
  list(@Param('tenderId', new ParseUUIDPipe()) tenderId: string) {
    return this.service.list(tenderId);
  }

  @Post()
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER, Role.CONSULTANT)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 60 * 1024 * 1024 }, // 60 MB hard limit multer
  }))
  upload(
    @Param('tenderId', new ParseUUIDPipe()) tenderId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .build({ fileIsRequired: true }),
    ) file: Express.Multer.File,
    @Body() dto: UploadTenderDocumentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.upload(tenderId, file, dto, user.sub);
  }
}

/**
 * Endpoints sur un document unique (get, update, delete).
 * Route: /api/tender-documents/:id
 */
@Controller('tender-documents')
@UseGuards(RolesGuard)
export class TenderDocumentsController {
  constructor(private readonly service: TenderDocumentsService) {}

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTenderDocumentDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  delete(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.delete(id);
  }
}
