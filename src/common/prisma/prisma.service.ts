import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { TenantContext } from '../tenant/tenant-context';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Prisma 7 supprime le moteur "library" : il faut fournir un driver adapter.
    // On branche le driver pg sur DATABASE_URL (Neon, sslmode=require).
    super({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
      }),
      log: ['error', 'warn'],
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Prisma connected to Neon');
    } catch (error) {
      this.logger.error('Failed to connect to Neon', error);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async withPlatformContext<T>(fn: () => Promise<T>): Promise<T> {
    return TenantContext.run(
      {
        tenantId: '',
        userId: '',
        role: 'PLATFORM',
        grade: null,
        bypassRls: true,
      },
      fn,
    );
  }
}