import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Sélection par défaut : on ne renvoie JAMAIS passwordHash */
  private static readonly SAFE_SELECT: Prisma.UserSelect = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    role: true,
    grade: true,
    isActive: true,
    lastLoginAt: true,
    createdAt: true,
    updatedAt: true,
    invitationExpiresAt: true,
    invitedAt: true,
    passwordHash: false, // toujours masqué
  };

  async list() {
    return this.prisma.user.findMany({
      where: { cabinetId: TenantContext.tenantId() },
      select: UsersService.SAFE_SELECT,
      orderBy: [{ isActive: 'desc' }, { lastName: 'asc' }],
    });
  }

  async getById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, cabinetId: TenantContext.tenantId() },
      select: UsersService.SAFE_SELECT,
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  async create(dto: CreateUserDto) {
    const rounds = Number(this.config.get('BCRYPT_ROUNDS', 12));
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    try {
      return await this.prisma.user.create({
        data: {
          email: dto.email.toLowerCase().trim(),
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: dto.role,
          grade: dto.grade,
          // cabinetId injecté automatiquement via RLS ? Non : Prisma ne le
          // devine pas, il faut le passer. On le récupère du contexte.
          cabinet: { connect: { id: this.getTenantId() } },
        },
        select: UsersService.SAFE_SELECT,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email déjà utilisé dans ce cabinet');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateUserDto) {
    const data: Prisma.UserUpdateInput = { ...dto };

    if (dto.password) {
      const rounds = Number(this.config.get('BCRYPT_ROUNDS', 12));
      data.passwordHash = await bcrypt.hash(dto.password, rounds);
      delete (data as Record<string, unknown>).password;
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data,
        select: UsersService.SAFE_SELECT,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Utilisateur introuvable');
      }
      throw e;
    }
  }

  /** Soft delete : on désactive, on ne supprime pas (traçabilité audit) */
  async deactivate(id: string, currentUserId: string) {
    if (id === currentUserId) {
      throw new BadRequestException('Impossible de désactiver son propre compte');
    }
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: UsersService.SAFE_SELECT,
    });
  }

  private getTenantId(): string {
    // Importer ici pour éviter un cycle
    const { TenantContext } = require('../../common/tenant/tenant-context');
    return TenantContext.tenantId();
  }
}
