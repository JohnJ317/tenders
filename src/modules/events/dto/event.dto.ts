import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Min,
  MinLength,
} from 'class-validator';
import { Country, EventStage, EventType } from '@prisma/client';

export class CreateEventDto {
  @IsString()
  @Length(3, 500)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(EventType)
  type!: EventType;

  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsAt?: Date;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  location?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  city?: string;

  @IsOptional()
  @IsEnum(Country)
  country?: Country;

  @IsOptional()
  @IsBoolean()
  isVirtual?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  registrationCost?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  travelCost?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  expectedLeads?: number;

  @IsOptional()
  @IsUrl()
  url?: string;

  @IsOptional()
  @IsUUID()
  leadUserId?: string;
}

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @Length(3, 500)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsAt?: Date;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  location?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  city?: string;

  @IsOptional()
  @IsEnum(Country)
  country?: Country;

  @IsOptional()
  @IsBoolean()
  isVirtual?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  registrationCost?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  travelCost?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  expectedLeads?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  actualLeads?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  convertedLeads?: number;

  @IsOptional()
  @IsString()
  roiNotes?: string;

  @IsOptional()
  @IsUrl()
  url?: string;

  @IsOptional()
  @IsUUID()
  leadUserId?: string;
}

export class TransitionEventDto {
  @IsEnum(EventStage)
  toStage!: EventStage;

  @IsString()
  @MinLength(3)
  note!: string;
}

export class ListEventsDto {
  @IsOptional()
  @IsEnum(EventStage)
  stage?: EventStage;

  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @IsOptional()
  @IsUUID()
  leadUserId?: string;
}
