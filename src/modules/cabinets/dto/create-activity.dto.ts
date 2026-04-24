import { IsEnum, IsString, Length } from 'class-validator';
import { ActivityType } from '@prisma/client';

export class CreateActivityDto {
  @IsEnum(ActivityType)
  type!: ActivityType;

  @IsString()
  @Length(2, 200)
  label!: string;
}
