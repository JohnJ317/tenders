import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

/**
 * Saisie d'une simulation de prix pour un AO.
 * Les coefficients sont fournis par leur "code" (ex: "SECTOR_BANK_INSURANCE").
 */
export class SimulatePricingDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  associeHours!: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  managerHours!: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  seniorHours!: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  juniorHours!: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  assistantHours!: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  travelCost?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  otherCosts?: number;

  @IsOptional() @IsString() @Length(0, 200)
  otherCostsLabel?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  coefficientCodes!: string[];

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(0.9)
  floorMarginRate?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(0.9)
  targetMarginRate?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(0.9)
  ceilingMarginRate?: number;
}

export class SavePricingDto extends SimulatePricingDto {
  @IsString() @Length(2, 200)
  name!: string;

  @IsOptional() @IsString()
  notes?: string;
}
