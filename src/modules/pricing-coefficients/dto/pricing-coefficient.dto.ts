import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PricingCoefficientCategory } from '@prisma/client';

export class CreateCoefficientDto {
  @IsString()
  @Length(2, 100)
  @Matches(/^[A-Z][A-Z0-9_]+$/, {
    message: 'Le code doit être en SNAKE_CASE majuscule (ex: SECTOR_MINING)',
  })
  code!: string;

  @IsString()
  @Length(2, 200)
  label!: string;

  @IsEnum(PricingCoefficientCategory)
  category!: PricingCoefficientCategory;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.5)
  @Max(2.0)
  multiplier!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class UpdateCoefficientDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  label?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.5)
  @Max(2.0)
  multiplier?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
