import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { PricingService } from './pricing.service';
import { PricingPdfService } from './pdf-generator.service';
import { SavePricingDto, SimulatePricingDto } from './dto/pricing.dto';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtPayload } from '../../common/tenant/tenant.middleware';

/**
 * Endpoints de simulation/sauvegarde, imbriqués sous un AO parent.
 * /api/tenders/:tenderId/pricing/...
 */
@Controller('tenders/:tenderId/pricing')
@UseGuards(RolesGuard)
export class TenderPricingController {
  constructor(private readonly pricing: PricingService) {}

  @Post('simulate')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  simulate(
    @Param('tenderId', new ParseUUIDPipe()) tenderId: string,
    @Body() dto: SimulatePricingDto,
  ) {
    return this.pricing.simulateWithWinProbability(tenderId, dto);
  }

  @Post()
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  save(
    @Param('tenderId', new ParseUUIDPipe()) tenderId: string,
    @Body() dto: SavePricingDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pricing.save(tenderId, dto, user.sub);
  }

  @Get()
  list(@Param('tenderId', new ParseUUIDPipe()) tenderId: string) {
    return this.pricing.list(tenderId);
  }
}

/**
 * Endpoints sur une simulation unique (lecture, suppression, export PDF).
 * /api/tender-pricings/:id/...
 */
@Controller('tender-pricings')
@UseGuards(RolesGuard)
export class TenderPricingDetailController {
  constructor(
    private readonly pricing: PricingService,
    private readonly pdf: PricingPdfService,
  ) {}

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.pricing.getById(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  delete(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.pricing.delete(id);
  }

  @Get(':id/proposal.pdf')
  async downloadPdf(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.pdf.generate(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="proposition-financiere-${id.slice(0, 8)}.pdf"`,
    );
    res.send(pdfBuffer);
  }
}
