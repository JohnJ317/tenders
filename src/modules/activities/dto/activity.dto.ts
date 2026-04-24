import { IsBoolean, IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { ActivityType } from '@prisma/client';

export class CreateActivityDto {
  @IsEnum(ActivityType)
  type!: ActivityType;

  @IsString()
  @Length(2, 200)
  label!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateActivityDto {
  @IsOptional()
  @IsEnum(ActivityType)
  type?: ActivityType;

  @IsOptional()
  @IsString()
  @Length(2, 200)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
