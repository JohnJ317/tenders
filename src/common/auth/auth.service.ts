import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    grade: string | null;
    cabinet: { id: string; name: string };
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Login : on cherche l'utilisateur par email (potentiellement dans n'importe
   * quel cabinet) — c'est pour ça qu'on passe en mode platform (bypass RLS).
   * Une fois identifié, le JWT contient le cabinetId qui verrouille la session.
   */
  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.prisma.withPlatformContext(() =>
      this.prisma.user.findFirst({
        where: { email, isActive: true },
        include: { cabinet: true },
      }),
    );

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    if (user.cabinet.status === 'SUSPENDED' || user.cabinet.status === 'CANCELLED') {
      throw new UnauthorizedException(`Cabinet ${user.cabinet.status.toLowerCase()}`);
    }
    if ((user.cabinet as any).deletedAt) {
      throw new UnauthorizedException('Ce compte n\'est plus accessible. Contactez le support.');
    }

    // Dernière connexion — update en mode platform
    await this.prisma.withPlatformContext(() =>
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
    );

    const accessToken = this.jwt.sign(
      {
        sub: user.id,
        cabinetId: user.cabinetId,
        role: user.role,
        grade: user.grade,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: this.config.get('JWT_EXPIRES_IN', '12h'),
      },
    );

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        grade: user.grade,
        cabinet: { id: user.cabinet.id, name: user.cabinet.name },
      },
    };
  }
}
