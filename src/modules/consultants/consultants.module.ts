import {
  Body, Controller, Delete, Get, Module, Param, ParseUUIDPipe, Patch, Post,
  Query, UploadedFile, UseGuards, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Injectable } from '@nestjs/common';
import { ConsultantKind } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { JwtPayload } from '../../common/tenant/tenant.middleware';
import { randomUUID } from 'crypto';

interface CreateConsultantDto {
  kind?: ConsultantKind;
  fullName: string;
  title?: string;
  email?: string;
  phone?: string;
  yearsExperience?: number;
  skills?: string[];
  sectors?: string[];
  languages?: string[];
  dailyRate?: number;
  currency?: string;
  notes?: string;
}

interface UpdateConsultantDto extends Partial<CreateConsultantDto> {
  isActive?: boolean;
}

@Injectable()
export class ConsultantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(cabinetId: string, opts: { search?: string; kind?: string; isActive?: string }) {
    const where: any = { cabinetId };
    if (opts.isActive === 'true') where.isActive = true;
    if (opts.isActive === 'false') where.isActive = false;
    if (opts.kind && ['INTERNAL', 'EXTERNAL', 'PARTNER'].includes(opts.kind)) {
      where.kind = opts.kind;
    }
    if (opts.search) {
      where.OR = [
        { fullName: { contains: opts.search, mode: 'insensitive' } },
        { title: { contains: opts.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.consultant.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
      include: {
        _count: { select: { references: true } },
      },
    });
  }

  async findById(cabinetId: string, id: string) {
    const consultant = await this.prisma.consultant.findFirst({
      where: { id, cabinetId },
      include: {
        references: {
          include: {
            reference: {
              select: {
                id: true, projectName: true, clientName: true, status: true,
                country: true, sector: true,
              },
            },
          },
        },
      },
    });
    if (!consultant) throw new BadRequestException('Consultant introuvable');
    return consultant;
  }

  async create(cabinetId: string, dto: CreateConsultantDto) {
    if (!dto.fullName) throw new BadRequestException('Nom complet requis');
    return this.prisma.consultant.create({
      data: {
        cabinetId,
        kind: dto.kind ?? 'INTERNAL',
        fullName: dto.fullName,
        title: dto.title,
        email: dto.email,
        phone: dto.phone,
        yearsExperience: dto.yearsExperience,
        skills: dto.skills ?? [],
        sectors: dto.sectors ?? [],
        languages: dto.languages ?? [],
        dailyRate: dto.dailyRate,
        currency: dto.currency ?? 'XOF',
        notes: dto.notes,
      },
    });
  }

  async update(cabinetId: string, id: string, dto: UpdateConsultantDto) {
    await this.findById(cabinetId, id); // vérifie l'appartenance
    return this.prisma.consultant.update({
      where: { id },
      data: dto as any,
    });
  }

  async remove(cabinetId: string, id: string) {
    const c = await this.findById(cabinetId, id);
    if (c.cvFileKey) {
      try {
        await this.storage.delete(c.cvFileKey);
      } catch (e) {
        // log mais ne bloque pas
      }
    }
    return this.prisma.consultant.delete({ where: { id } });
  }

  async uploadCv(cabinetId: string, id: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Fichier manquant');
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Seuls les PDFs sont acceptés');
    }
    const consultant = await this.findById(cabinetId, id);

    // Supprimer l'ancien si existe
    if (consultant.cvFileKey) {
      try { await this.storage.delete(consultant.cvFileKey); } catch {}
    }

    const key = `consultants/${cabinetId}/${id}/${randomUUID()}.pdf`;
    await this.storage.upload(key, file.buffer, file.mimetype);

    return this.prisma.consultant.update({
      where: { id },
      data: {
        cvFileKey: key,
        cvFileName: file.originalname,
      },
    });
  }

  async downloadCv(cabinetId: string, id: string) {
    const c = await this.findById(cabinetId, id);
    if (!c.cvFileKey) throw new BadRequestException('Aucun CV enregistré');
    const url = await this.storage.getDownloadUrl(c.cvFileKey, c.cvFileName ?? undefined);
    return { url, filename: c.cvFileName };
  }
}

@Controller('consultants')
@UseGuards(RolesGuard)
export class ConsultantsController {
  constructor(private readonly service: ConsultantsService) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('kind') kind?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.service.list(user.cabinetId, { search, kind, isActive });
  }

  @Get(':id')
  findById(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findById(user.cabinetId, id);
  }

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateConsultantDto,
  ) {
    return this.service.create(user.cabinetId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConsultantDto,
  ) {
    return this.service.update(user.cabinetId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(user.cabinetId, id);
  }

  @Post(':id/cv')
  @UseInterceptors(FileInterceptor('file'))
  uploadCv(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.uploadCv(user.cabinetId, id, file);
  }

  @Get(':id/cv')
  downloadCv(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.downloadCv(user.cabinetId, id);
  }
}

@Module({
  controllers: [ConsultantsController],
  providers: [ConsultantsService],
  exports: [ConsultantsService],
})
export class ConsultantsModule {}
