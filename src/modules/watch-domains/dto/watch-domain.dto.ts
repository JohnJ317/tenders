import {
  ArrayMaxSize, IsArray, IsBoolean, IsNumber, IsOptional, IsString,
  Length, Min,
} from 'class-validator';

export class CreateWatchDomainDto {
  @IsString() @Length(2, 200)
  name!: string;

  @IsArray() @IsString({ each: true }) @ArrayMaxSize(50)
  keywords: string[] = [];

  @IsArray() @IsString({ each: true }) @ArrayMaxSize(30)
  sectors: string[] = [];

  @IsArray() @IsString({ each: true }) @ArrayMaxSize(30)
  countries: string[] = [];

  @IsArray() @IsString({ each: true }) @ArrayMaxSize(30)
  sources: string[] = [];

  @IsOptional() @IsNumber() @Min(0)
  minBudget?: number;

  @IsOptional() @IsNumber() @Min(0)
  maxBudget?: number;

  @IsOptional() @IsBoolean()
  includeTenders?: boolean;

  @IsOptional() @IsBoolean()
  includeEoi?: boolean;
}

export class UpdateWatchDomainDto {
  @IsOptional() @IsString() @Length(2, 200) name?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) keywords?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) sectors?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) countries?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) sources?: string[];
  @IsOptional() @IsNumber() @Min(0) minBudget?: number;
  @IsOptional() @IsNumber() @Min(0) maxBudget?: number;
  @IsOptional() @IsBoolean() includeTenders?: boolean;
  @IsOptional() @IsBoolean() includeEoi?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
