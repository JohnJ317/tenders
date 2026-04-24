import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Min,
  MinLength,
} from 'class-validator';
import { Country, TenderSource, TenderStage, TenderType } from '@prisma/client';

export class CreateTenderDto {
  @IsString()
  @Length(3, 500)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  reference?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  clientName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  sector?: string;

  @IsOptional()
  @IsEnum(TenderSource)
  source?: TenderSource;

  @IsOptional()
  @IsEnum(TenderType)
  type?: TenderType;

  @IsOptional()
  @IsEnum(Country)
  country?: Country;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  publishedAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  submissionDeadline?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  decisionExpectedAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  budgetIndicative?: number;

  @IsOptional()
  @IsUrl()
  sourceUrl?: string;

  @IsOptional()
  @IsUUID()
  leadUserId?: string;
}

export class UpdateTenderDto {
  @IsOptional()
  @IsString()
  @Length(3, 500)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  reference?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  clientName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  sector?: string;

  @IsOptional()
  @IsEnum(TenderSource)
  source?: TenderSource;

  @IsOptional()
  @IsEnum(TenderType)
  type?: TenderType;

  @IsOptional()
  @IsEnum(Country)
  country?: Country;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  publishedAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  submissionDeadline?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  decisionExpectedAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  budgetIndicative?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  ourProposedAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  wonAmount?: number;

  @IsOptional()
  @IsUrl()
  sourceUrl?: string;

  @IsOptional()
  @IsUUID()
  leadUserId?: string;
}

export class TransitionTenderDto {
  @IsEnum(TenderStage)
  toStage!: TenderStage;

  @IsString()
  @IsOptional()
  @MinLength(3, { message: 'La note doit faire au moins 3 caractères' })
  note?: string;

  /** Montant final signé — requis si toStage = WON */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  wonAmount?: number;

  /** Raison de perte — requise si toStage = LOST */
  @IsOptional()
  @IsString()
  lostReason?: string;
}

export class ListTendersDto {
  @IsOptional()
  @IsEnum(TenderStage)
  stage?: TenderStage;

  @IsOptional()
  @IsEnum(TenderSource)
  source?: TenderSource;

  @IsOptional()
  @IsUUID()
  leadUserId?: string;

  @IsOptional()
  @Type(() => Boolean)
  isOpen?: boolean;
}
