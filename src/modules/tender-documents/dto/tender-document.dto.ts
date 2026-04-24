import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { TenderDocumentCategory } from '@prisma/client';

export class UploadTenderDocumentDto {
  @IsEnum(TenderDocumentCategory)
  category!: TenderDocumentCategory;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;
}

export class UpdateTenderDocumentDto {
  @IsOptional()
  @IsEnum(TenderDocumentCategory)
  category?: TenderDocumentCategory;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;
}
