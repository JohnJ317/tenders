import {
  Body, Controller, Get, HttpCode, HttpStatus, Module, Param, Post, UseGuards,
} from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Role, Grade } from '@prisma/client';
import { InvitationsService } from './invitations.service';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { JwtPayload } from '../../common/tenant/tenant.middleware';

import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

class CreateInvitationDto {
  @IsEmail({}, { message: 'Email invalide' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Prénom requis' })
  firstName!: string;

  @IsString()
  @IsNotEmpty({ message: 'Nom requis' })
  lastName!: string;

  @IsEnum(Role, { message: 'Rôle invalide' })
  role!: Role;

  @IsOptional()
  @IsEnum(Grade, { message: 'Grade invalide' })
  grade?: Grade | null;
}

class AcceptInvitationDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(8, { message: '8 caractères minimum' })
  password!: string;
}

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly service: InvitationsService) {}

  /** Créer et envoyer une invitation (admin cabinet uniquement) */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.service.invite({
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      grade: dto.grade,
      invitedById: user.sub,
    });
  }

  /** Renvoyer une invitation */
  @Post(':userId/resend')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  resend(@Param('userId') userId: string) {
    return this.service.resend(userId);
  }

  /** Validation publique d'un token (pour pré-remplir le form) */
  @Get('validate/:token')
  validate(@Param('token') token: string) {
    return this.service.validateToken(token);
  }

  /** Acceptation publique d'une invitation */
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  accept(@Body() dto: AcceptInvitationDto) {
    return this.service.accept({ token: dto.token, password: dto.password });
  }
}

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [InvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
