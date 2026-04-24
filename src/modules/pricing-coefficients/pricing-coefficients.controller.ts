import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PricingCoefficientCategory, Role } from '@prisma/client';
import { PricingCoefficientsService } from './pricing-coefficients.service';
import {
  CreateCoefficientDto,
  UpdateCoefficientDto,
} from './dto/pricing-coefficient.dto';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';

@Controller('pricing-coefficients')
@UseGuards(RolesGuard)
export class PricingCoefficientsController {
  constructor(private readonly service: PricingCoefficientsService) {}

  @Get()
  list(
    @Query('category', new ParseEnumPipe(PricingCoefficientCategory, { optional: true }))
    category?: PricingCoefficientCategory,
    @Query('includeInactive', new ParseBoolPipe({ optional: true }))
    includeInactive = false,
  ) {
    return this.service.list(category, includeInactive);
  }

  @Get('grouped')
  grouped() {
    return this.service.listGrouped();
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getById(id);
  }

  @Post()
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  create(@Body() dto: CreateCoefficientDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCoefficientDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  delete(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.delete(id);
  }
}
