import { IsEmail, IsEnum, IsOptional, IsString, Length, MinLength } from 'class-validator';
import { Grade, Role } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @Length(1, 100)
  firstName!: string;

  @IsString()
  @Length(1, 100)
  lastName!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsEnum(Grade)
  grade?: Grade;
}
