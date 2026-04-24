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
import { EventDocumentsService } from './event-documents.service';
import {
  UpdateEventDocumentDto,
  UploadEventDocumentDto,
} from './dto/event-document.dto';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtPayload } from '../../common/tenant/tenant.middleware';

@Controller('events/:eventId/documents')
@UseGuards(RolesGuard)
export class EventEventDocumentsController {
  constructor(private readonly service: EventDocumentsService) {}

  @Get()
  list(@Param('eventId', new ParseUUIDPipe()) eventId: string) {
    return this.service.list(eventId);
  }

  @Post()
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER, Role.CONSULTANT)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 60 * 1024 * 1024 },
  }))
  upload(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @UploadedFile(
      new ParseFilePipeBuilder().build({ fileIsRequired: true }),
    ) file: Express.Multer.File,
    @Body() dto: UploadEventDocumentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.upload(eventId, file, dto, user.sub);
  }
}

@Controller('event-documents')
@UseGuards(RolesGuard)
export class EventDocumentsController {
  constructor(private readonly service: EventDocumentsService) {}

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEventDocumentDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  delete(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.delete(id);
  }
}
