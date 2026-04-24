import {
  Body, Controller, Get, Injectable, Module, NotFoundException,
  Param, ParseUUIDPipe, Post, Query, UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtPayload } from '../../common/tenant/tenant.middleware';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { Role, TenderSource, TenderStage } from '@prisma/client';

class PromoteDto {
  @IsIn(['TENDER', 'EVENT'])
  target!: 'TENDER' | 'EVENT';

  @IsOptional() @IsString()
  notes?: string;
}

@Injectable()
export class ScrapedTendersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Liste les AO scrapés matchés pour le cabinet courant */
  listMatched(status?: 'MATCHED' | 'PROMOTED' | 'ALL') {
    const cabinetId = TenantContext.tenantId();
    const where: any = { matchedCabinetIds: { has: cabinetId } };
    if (status === 'MATCHED') where.status = 'MATCHED';
    else if (status === 'PROMOTED') where.status = 'PROMOTED';

    return this.prisma.scrapedTender.findMany({
      where,
      orderBy: { scrapedAt: 'desc' },
      take: 200,
    });
  }

  async getById(id: string) {
    const cabinetId = TenantContext.tenantId();
    const scraped = await this.prisma.scrapedTender.findFirst({
      where: { id, matchedCabinetIds: { has: cabinetId } },
    });
    if (!scraped) throw new NotFoundException('AO scrapé introuvable pour ce cabinet');
    return scraped;
  }

  /** Promeut un ScrapedTender en Tender dans le pipeline du cabinet */
  async promote(id: string, dto: PromoteDto, userId: string) {
    const cabinetId = TenantContext.tenantId();
    const scraped = await this.getById(id);

    if (scraped.status === 'PROMOTED' && scraped.promotedTenderId) {
      return { alreadyPromoted: true, tenderId: scraped.promotedTenderId };
    }

    // Map source code vers l'enum Prisma (fallback OTHER)
    const sourceEnum = this.mapSourceEnum(scraped.source);

    const tender = await this.prisma.tender.create({
      data: {
        cabinetId,
        reference: scraped.externalRef?.slice(0, 100),
        title: scraped.title,
        description: scraped.description || dto.notes,
        clientName: scraped.clientName,
        sector: scraped.sector,
        source: sourceEnum,
        type: scraped.isEoi ? 'AMI' : 'OPEN',
        country: this.mapCountryEnum(scraped.country),
        stage: TenderStage.WATCHING,
        publishedAt: scraped.publishedAt,
        submissionDeadline: scraped.submissionDeadline,
        budgetIndicative: scraped.budgetIndicative,
        currency: scraped.currency || 'XOF',
        sourceUrl: scraped.sourceUrl,
        createdById: userId,
        leadUserId: userId,
      },
    });

    // Transition initiale de création
    await this.prisma.tenderTransition.create({
      data: {
        tenderId: tender.id,
        fromStage: null,
        toStage: TenderStage.WATCHING,
        note: `Créé depuis un AO scrapé (source: ${scraped.source})`,
        performedById: userId,
      },
    });

    // Marque le ScrapedTender comme promu
    await this.prisma.scrapedTender.update({
      where: { id: scraped.id },
      data: { status: 'PROMOTED', promotedTenderId: tender.id },
    });

    return { alreadyPromoted: false, tenderId: tender.id };
  }

  /** Rejette explicitement un AO scrapé pour le cabinet (n'apparaîtra plus) */
  async dismiss(id: string) {
    const cabinetId = TenantContext.tenantId();
    const scraped = await this.getById(id);
    // Retire le cabinet de la liste des matchés
    const ids = (scraped.matchedCabinetIds as string[]).filter((c) => c !== cabinetId);
    await this.prisma.scrapedTender.update({
      where: { id },
      data: { matchedCabinetIds: ids },
    });
    // Dismiss l'alerte associée aussi
    await this.prisma.alert.updateMany({
      where: { cabinetId, scrapedTenderId: id },
      data: { dismissedAt: new Date() },
    });
    return { dismissed: true };
  }

  private mapCountryEnum(country: string | null | undefined): any {
    if (!country) return "OTHER";
    const valid = ["CI","SN","BF","ML","TG","BJ","NE","GW","CM","GA","CD","MG"];
    return valid.includes(country) ? country : "OTHER";
  }

  private mapSourceEnum(sourceCode: string): TenderSource {
    const known: Partial<Record<string, TenderSource>> = {
      WORLD_BANK: 'WORLD_BANK',
      SIGMAP_CI: 'SIGMAP',
      AFD: 'AFD',
      AFDB: 'AFDB',
      UNGM: 'UNGM',
      EU_TED: 'EU',
      USAID_SAM: 'USAID',
    };
    return (known[sourceCode] as TenderSource) ?? 'OTHER';
  }
}

@Controller('scraped-tenders')
@UseGuards(RolesGuard)
export class ScrapedTendersController {
  constructor(private readonly service: ScrapedTendersService) {}

  @Get()
  list(@Query('status') status?: 'MATCHED' | 'PROMOTED' | 'ALL') {
    return this.service.listMatched(status);
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getById(id);
  }

  @Post(':id/promote')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  promote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PromoteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.promote(id, dto, user.sub);
  }

  @Post(':id/dismiss')
  dismiss(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.dismiss(id);
  }
}

@Module({
  controllers: [ScrapedTendersController],
  providers: [ScrapedTendersService],
  exports: [ScrapedTendersService],
})
export class ScrapedTendersModule {}
