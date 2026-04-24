import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { CompetitiveIntelSource } from '@prisma/client';

export class CreateCompetitiveIntelDto {
  @IsString() @Length(2, 200)
  competitorName!: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  competitorPrice?: number;

  @IsOptional() @IsBoolean()
  isWinner?: boolean;

  @IsOptional() @IsEnum(CompetitiveIntelSource)
  source?: CompetitiveIntelSource;

  @IsOptional() @IsString()
  notes?: string;
}

export class UpdateCompetitiveIntelDto {
  @IsOptional() @IsString() @Length(2, 200)
  competitorName?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  competitorPrice?: number;

  @IsOptional() @IsBoolean()
  isWinner?: boolean;

  @IsOptional() @IsEnum(CompetitiveIntelSource)
  source?: CompetitiveIntelSource;

  @IsOptional() @IsString()
  notes?: string;
}
