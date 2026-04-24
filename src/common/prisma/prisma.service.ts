import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContext } from '../tenant/tenant-context';

/**
 * PrismaService multi-tenant avec enforcement RLS.
 *
 * Pattern : on utilise Prisma Client Extensions ($extends) avec le component
 * `query` qui intercepte chaque query côté client, AVANT que Prisma ne lance
 * son propre pipeline asynchrone interne. Le contexte AsyncLocalStorage est
 * donc encore accessible à ce niveau.
 *
 * Chaque query est encapsulée dans une transaction courte qui exécute
 * SET LOCAL app.current_tenant_id = '<uuid>' avant de lancer la query réelle.
 * Les policies RLS de PostgreSQL lisent ce paramètre et filtrent les lignes.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error', 'warn'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Exécute une fonction avec RLS bypass. Pour login, signup, et opérations
   * cross-tenant (admin plateforme, jobs de maintenance).
   */
  async withPlatformContext<T>(fn: () => Promise<T>): Promise<T> {
    return TenantContext.run(
      { tenantId: '', userId: '', role: 'PLATFORM', grade: null, bypassRls: true },
      fn,
    );
  }
}