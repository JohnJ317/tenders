import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { EventDocumentCategory } from '@prisma/client';

export class UploadEventDocumentDto {
  @IsEnum(EventDocumentCategory)
  category!: EventDocumentCategory;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;
}

export class UpdateEventDocumentDto {
  @IsOptional()
  @IsEnum(EventDocumentCategory)
  category?: EventDocumentCategory;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;
}
