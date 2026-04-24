import {
  Body, Controller, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe,
  Patch, Post, UseGuards, Logger, Query,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlatformService } from './platform.service';
import { PlatformFinanceService } from './platform-finance.service';
import { SuperAdminGuard } from '../../common/platform/platform-core.module';
import { WaveSignatureGuard } from '../../common/platform/wave-signature.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtPayload } from '../../common/tenant/tenant.middleware';

// ============================================================
// /platform/cabinets (SUPER_ADMIN only)
// ============================================================
@Controller('platform/cabinets')
@UseGuards(SuperAdminGuard)
export class PlatformCabinetsController {
  constructor(private readonly platform: PlatformService) {}

  @Get('stats/global')
  globalStats() {
    return this.platform.getGlobalStats();
  }

  @Get()
  list() {
    return this.platform.listCabinets();
  }


  @Get('archived')
  listArchived() {
    return this.platform.listArchivedCabinets();
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.getCabinetDetail(id);
  }


  @Get('list/filtered')
  listFiltered(@Body() body: any) {
    return this.platform.listCabinetsFiltered(body?.includeArchived === true);
  }

  @Post()
  createCabinet(@Body() body: {
    name: string;
    country: string;
    currency: string;
    vatRate: number;
    language: string;
    adminEmail: string;
    adminFirstName: string;
    adminLastName: string;
    monthlySubscriptionFcfa?: number;
    platformCommissionRate?: number;
  }) {
    return this.platform.createCabinet(body);
  }

  @Patch(':id/full')
  updateFull(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: any,
  ) {
    return this.platform.updateCabinetFull(id, body);
  }

  @Post(':id/archive')
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.archiveCabinet(id);
  }

  @Post(':id/restore')
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.restoreCabinet(id);
  }

  @Patch(':id/commission-rate')
  updateCommissionRate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { rate: number },
  ) {
    return this.platform.updateCommissionRate(id, body.rate);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' },
  ) {
    return this.platform.setCabinetStatus(id, body.status);
  }
}

// ============================================================
// /platform/subscriptions
// ============================================================
@Controller('platform/subscriptions')
@UseGuards(SuperAdminGuard)
export class PlatformSubscriptionsController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  list() {
    return this.platform.listSubscriptions();
  }

  @Post('mark-paid')
  @HttpCode(HttpStatus.OK)
  markPaid(@Body() body: {
    cabinetId: string;
    amountFcfa: number;
    reference?: string;
    method?: 'WAVE' | 'BANK_TRANSFER' | 'MANUAL';
  }) {
    return this.platform.markPaymentReceived(body);
  }

  @Post('run-suspension-check')
  @HttpCode(HttpStatus.OK)
  runSuspension() {
    return this.platform.runSuspensionCheck();
  }

  @Post('run-reminder-check')
  @HttpCode(HttpStatus.OK)
  runReminder() {
    return this.platform.runReminderCheck();
  }
}

// ============================================================
// /platform/commissions
// ============================================================
@Controller('platform/commissions')
@UseGuards(SuperAdminGuard)
export class PlatformCommissionsController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  list() {
    return this.platform.listCommissions();
  }

  @Patch(':id/invoiced')
  markInvoiced(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.markCommissionInvoiced(id);
  }

  @Patch(':id/paid')
  markPaid(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.markCommissionPaid(id);
  }
}

// ============================================================
// /platform/config
// ============================================================
@Controller('platform/config')
@UseGuards(SuperAdminGuard)
export class PlatformConfigController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  get() {
    return this.platform.getConfig();
  }

  @Patch()
  update(@Body() body: any) {
    return this.platform.updateConfig(body);
  }
}

// ============================================================
// /webhooks/wave/payment (PUBLIC - sans auth)
// ============================================================
@Controller('webhooks/wave')
@UseGuards(WaveSignatureGuard)
export class WaveWebhookController {
  private readonly logger = new Logger(WaveWebhookController.name);
  constructor(
    private readonly platform: PlatformService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Webhook Wave : marque un paiement comme reçu.
   *
   * Format payload officiel Wave (https://docs.wave.com/webhook) :
   * {
   *   "id": "EV_QvEZuDSQbLdI",                        // event id (idempotence)
   *   "type": "checkout.session.completed",           // ou merchant.payment_received
   *   "data": {
   *     "id": "cos-18qq25rgr100a",                    // checkout session id
   *     "amount": "1000",                             // STRING (à parser)
   *     "currency": "XOF",
   *     "payment_status": "succeeded",
   *     "checkout_status": "complete",
   *     "client_reference": "cabinet-uuid-xxx",       // <- on y stocke le cabinetId
   *     "transaction_id": "TCN4Y4ZC3FM",
   *     "when_completed": "2021-12-08T10:15:32Z"
   *   }
   * }
   *
   * IMPORTANT : on répond TOUJOURS 200 si l'event est valide structurellement,
   * même si on ne peut pas l'appliquer (cabinet introuvable, etc.). Sinon Wave
   * réessaie pendant 3 jours.
   */
  @Post('payment')
  @HttpCode(HttpStatus.OK)
  async payment(@Body() body: any) {
    // 1. Validation structure
    const eventId = body?.id;
    const eventType = body?.type;
    const data = body?.data;

    if (!eventId || !eventType || !data) {
      this.logger.warn(`Webhook Wave invalide (id/type/data manquants) : ${JSON.stringify(body)?.slice(0, 200)}`);
      return { ok: true, ignored: true, reason: 'invalid structure' };
    }

    this.logger.log(`Wave webhook reçu : ${eventType} (event=${eventId})`);

    // 2. Idempotence : a-t-on déjà traité cet event ?
    const alreadyProcessed = await (this.prisma as any).webhookEventProcessed.findUnique({
      where: { eventId },
    }).catch(() => null);

    if (alreadyProcessed) {
      this.logger.log(`Event ${eventId} déjà traité → ignoré (idempotence)`);
      return { ok: true, duplicate: true };
    }

    // 3. Filtrer les events qu'on traite (paiements réussis uniquement)
    const RELEVANT = ['checkout.session.completed', 'merchant.payment_received', 'b2b.payment_received'];
    if (!RELEVANT.includes(eventType)) {
      this.logger.log(`Event type ${eventType} non traité → ignoré`);
      // On marque quand même comme processed pour ne pas re-recevoir
      await this.markProcessed(eventId, eventType, null);
      return { ok: true, ignored: true, reason: 'event type not handled' };
    }

    // 4. Vérifier statut de paiement
    const paymentStatus = data.payment_status || data.checkout_status;
    if (paymentStatus !== 'succeeded' && paymentStatus !== 'complete') {
      this.logger.log(`Paiement non réussi (status=${paymentStatus}) → ignoré`);
      await this.markProcessed(eventId, eventType, null);
      return { ok: true, ignored: true, reason: 'payment not successful' };
    }

    // 5. Récupérer cabinetId depuis client_reference
    const cabinetId = data.client_reference;
    if (!cabinetId) {
      this.logger.warn(`Webhook Wave sans client_reference (event=${eventId})`);
      await this.markProcessed(eventId, eventType, null);
      return { ok: true, ignored: true, reason: 'no client_reference' };
    }

    // 6. Parser le montant (Wave envoie en STRING)
    const amountFcfa = parseInt(String(data.amount), 10);
    if (Number.isNaN(amountFcfa) || amountFcfa <= 0) {
      this.logger.warn(`Montant invalide : ${data.amount}`);
      await this.markProcessed(eventId, eventType, null);
      return { ok: true, ignored: true, reason: 'invalid amount' };
    }

    // 7. Marquer le paiement reçu (best-effort)
    try {
      const payment = await this.platform.markPaymentReceived({
        cabinetId,
        amountFcfa,
        waveTransactionId: data.transaction_id || data.id,
        reference: data.client_reference,
      });
      await this.markProcessed(eventId, eventType, payment?.id ?? null);
      this.logger.log(`✅ Paiement enregistré : cabinet=${cabinetId}, montant=${amountFcfa} FCFA`);
      return { ok: true, paymentId: payment?.id };
    } catch (err: any) {
      this.logger.error(`Erreur markPaymentReceived (cabinet=${cabinetId}) : ${err.message}`);
      // On marque processed pour éviter retry infini sur erreur applicative
      await this.markProcessed(eventId, eventType, null);
      return { ok: true, error: err.message };
    }
  }

  /** Marque un event comme traité dans la DB pour idempotence */
  private async markProcessed(eventId: string, eventType: string, paymentId: string | null) {
    try {
      await (this.prisma as any).webhookEventProcessed.create({
        data: {
          eventId,
          eventType,
          source: 'wave',
          paymentId: paymentId ?? undefined,
        },
      });
    } catch (err: any) {
      // Si race condition (UNIQUE constraint), c'est OK : déjà processed entre-temps
      if (!err.message?.includes('Unique constraint')) {
        this.logger.error(`Failed to mark event ${eventId} as processed: ${err.message}`);
      }
    }
  }
}

// ============================================================
// /billing (cabinet-side, pour voir sa propre facture)
// ============================================================
@Controller('billing')
export class CabinetBillingController {
  constructor(private readonly platform: PlatformService) {}

  /** Détail billing du cabinet courant (authentifié) */
  @Get('me')
  async myBilling(@CurrentUser() user: JwtPayload) {
    const cabinet = await this.platform.getCabinetDetail(user.cabinetId);
    const config = await this.platform.getConfig();

    // Ne pas exposer le commission rate au cabinet (mais on montre les commissions impayées si elles sont déjà créées)
    return {
      subscription: cabinet.subscription,
      payments: cabinet.payments,
      usage: cabinet.usage,
      pendingCommissions: cabinet.commissionInvoices.filter((c: any) => c.status === 'PENDING'),
      wavePaymentLink: config.wavePaymentLink,
      cabinetId: user.cabinetId,
      monthlySubscriptionFcfa: Number(config.monthlySubscriptionFcfa),
    };
  }
}

// ============================================================
// MODULE
// ============================================================

// ============================================================
// /platform/finance (SUPER_ADMIN only)
// ============================================================
@Controller('platform/finance')
@UseGuards(SuperAdminGuard)
export class PlatformFinanceController {
  constructor(private readonly finance: PlatformFinanceService) {}

  @Get()
  getDashboard(@Query('period') period?: string) {
    const validPeriods = ['1m', '3m', '6m', '12m', 'all'];
    const p = validPeriods.includes(period ?? '') ? (period as any) : '12m';
    return this.finance.getFinanceDashboard(p);
  }
}

// ============================================================
// PLATFORM SCHEDULER — retiré au profit du déclenchement HTTP externe.
// Voir `src/modules/cron/cron.controller.ts` (POST /api/cron/platform/daily-tasks).
// ============================================================

@Module({
  controllers: [
    PlatformCabinetsController,
    PlatformFinanceController,
    PlatformSubscriptionsController,
    PlatformCommissionsController,
    PlatformConfigController,
    WaveWebhookController,
    CabinetBillingController,
  ],
  providers: [PlatformService, PlatformFinanceService],
  exports: [PlatformService],
})
export class PlatformModule {}
