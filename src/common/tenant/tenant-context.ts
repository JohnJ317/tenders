import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexte de la requête courante, propagé automatiquement à travers
 * les appels asynchrones grâce à AsyncLocalStorage.
 */
export interface RequestContext {
  tenantId: string;
  userId: string;
  role: string;
  grade: string | null;
  /**
   * Si true, les opérations Prisma bypassent la vérification RLS en
   * n'exécutant PAS le SET LOCAL app.current_tenant_id. Réservé aux
   * opérations plateforme (login, signup, jobs cross-tenant).
   */
  bypassRls?: boolean;
}

export const tenantStorage = new AsyncLocalStorage<RequestContext>();

export class TenantContext {
  /** Lance une fonction dans un contexte tenant donné. */
  static run<T>(ctx: RequestContext, fn: () => T): T {
    return tenantStorage.run(ctx, fn);
  }

  /** Retourne le contexte courant ou undefined si on est hors requête. */
  static current(): RequestContext | undefined {
    return tenantStorage.getStore();
  }

  /** Retourne le tenantId courant ou lève si absent. */
  static tenantId(): string {
    const ctx = tenantStorage.getStore();
    if (!ctx) {
      throw new Error(
        'TenantContext: aucun contexte tenant actif. ' +
        'Appel hors requête HTTP, ou middleware manquant.',
      );
    }
    return ctx.tenantId;
  }

  /** Vérifie si RLS doit être bypassé (platform ops). */
  static shouldBypassRls(): boolean {
    return tenantStorage.getStore()?.bypassRls === true;
  }
}
