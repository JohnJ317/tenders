import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsNumber, IsOptional, IsPositive, Min } from 'class-validator';
import { Grade } from '@prisma/client';

export class CreateGrilleHoraireDto {
  @IsEnum(Grade)
  grade!: Grade;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  hourlyRate!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  dailyRate?: number;

  @Type(() => Date)
  @IsDate()
  effectiveFrom!: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveTo?: Date;
}

export class UpdateGrilleHoraireDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  dailyRate?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveTo?: Date;
}
