import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface UsageLogParams {
  cabinetId: string;
  userId?: string | null;
  feature: string;              // ex: 'proposal:methodology', 'template:suggest', 'pricing'
  model: string;                // ex: 'claude-haiku-4-5'
  inputTokens: number;
  outputTokens: number;
  tenderId?: string | null;
  durationMs?: number | null;
}

/**
 * Service de logging centralisé pour les appels Claude.
 *
 * Usage dans n'importe quel service :
 *   const response = await this.anthropic.messages.create({...});
 *   await this.usageService.logUsage({
 *     cabinetId,
 *     feature: 'proposal:methodology',
 *     model: this.model,
 *     inputTokens: response.usage?.input_tokens ?? 0,
 *     outputTokens: response.usage?.output_tokens ?? 0,
 *     tenderId,
 *   });
 */
@Injectable()
export class ClaudeUsageService {
  private readonly logger = new Logger(ClaudeUsageService.name);
  private cachedConfig: any = null;
  private configCachedAt = 0;
  private static readonly CACHE_TTL_MS = 60_000; // Reconfig à chaud possible sans redémarrer

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Récupère la config tarifaire (cachée 1 min).
   */
  private async getConfig() {
    const now = Date.now();
    if (this.cachedConfig && now - this.configCachedAt < ClaudeUsageService.CACHE_TTL_MS) {
      return this.cachedConfig;
    }

    let config = await this.prisma.withPlatformContext(() =>
      this.prisma.platformConfig.findFirst(),
    );

    if (!config) {
      // Première exécution : crée la config par défaut
      config = await this.prisma.withPlatformContext(() =>
        this.prisma.platformConfig.create({ data: {} }),
      );
    }

    this.cachedConfig = config;
    this.configCachedAt = now;
    return config;
  }

  /**
   * Log un appel Claude (non bloquant — ne jamais faire planter l'appel principal).
   */
  async logUsage(params: UsageLogParams): Promise<void> {
    try {
      const config = await this.getConfig();

      const inputCost =
        (params.inputTokens / 1_000_000) * Number(config.claudeInputPricePerMtokFcfa);
      const outputCost =
        (params.outputTokens / 1_000_000) * Number(config.claudeOutputPricePerMtokFcfa);
      const costFcfa = inputCost + outputCost;

      await this.prisma.withPlatformContext(() =>
        this.prisma.claudeUsageLog.create({
          data: {
            cabinetId: params.cabinetId,
            userId: params.userId ?? null,
            feature: params.feature,
            model: params.model,
            inputTokens: params.inputTokens,
            outputTokens: params.outputTokens,
            costFcfa,
            tenderId: params.tenderId ?? null,
            durationMs: params.durationMs ?? null,
          },
        }),
      );
    } catch (err: any) {
      // Ne pas casser l'appel Claude si le log échoue
      this.logger.error(`Failed to log Claude usage: ${err.message}`, err.stack);
    }
  }

  /**
   * Stats d'usage pour un cabinet sur une période.
   */
  async getUsageStats(cabinetId: string, from: Date, to: Date) {
    return this.prisma.withPlatformContext(async () => {
      const logs = await this.prisma.claudeUsageLog.findMany({
        where: {
          cabinetId,
          createdAt: { gte: from, lte: to },
        },
        select: {
          feature: true,
          inputTokens: true,
          outputTokens: true,
          costFcfa: true,
          createdAt: true,
        },
      });

      const totalRequests = logs.length;
      const totalInputTokens = logs.reduce((s, l) => s + l.inputTokens, 0);
      const totalOutputTokens = logs.reduce((s, l) => s + l.outputTokens, 0);
      const totalCostFcfa = logs.reduce((s, l) => s + Number(l.costFcfa), 0);

      // Group par feature
      const byFeature: Record<string, { count: number; costFcfa: number }> = {};
      for (const l of logs) {
        if (!byFeature[l.feature]) byFeature[l.feature] = { count: 0, costFcfa: 0 };
        byFeature[l.feature].count++;
        byFeature[l.feature].costFcfa += Number(l.costFcfa);
      }

      return {
        totalRequests,
        totalInputTokens,
        totalOutputTokens,
        totalCostFcfa,
        byFeature: Object.entries(byFeature).map(([feature, data]) => ({
          feature,
          ...data,
        })).sort((a, b) => b.costFcfa - a.costFcfa),
      };
    });
  }

  /**
   * Total consommation pour tous les cabinets (vue super_admin).
   */
  async getGlobalStats(from: Date, to: Date) {
    return this.prisma.withPlatformContext(async () => {
      const logs = await this.prisma.claudeUsageLog.groupBy({
        by: ['cabinetId'],
        where: { createdAt: { gte: from, lte: to } },
        _count: true,
        _sum: {
          inputTokens: true,
          outputTokens: true,
          costFcfa: true,
        },
      });

      return logs.map((l) => ({
        cabinetId: l.cabinetId,
        requests: l._count,
        inputTokens: l._sum.inputTokens ?? 0,
        outputTokens: l._sum.outputTokens ?? 0,
        costFcfa: Number(l._sum.costFcfa ?? 0),
      }));
    });
  }
}
