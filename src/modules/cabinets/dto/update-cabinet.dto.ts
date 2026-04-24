import { IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { Country } from '@prisma/client';

export class UpdateCabinetDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;

  @IsOptional()
  @IsEnum(Country)
  country?: Country;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'Currency doit être un code ISO 4217 à 3 lettres' })
  currency?: string;

  @IsOptional()
  @IsString()
  @Length(2, 5)
  language?: string;
}
