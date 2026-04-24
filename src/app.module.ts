import { PlatformModule } from './modules/platform/platform.module';
import { PlatformCoreModule } from './common/platform/platform-core.module';
import { J360Module } from './modules/j360/j360.module';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsModule } from './modules/analytics/analytics.module';

import { PrismaModule } from './common/prisma/prisma.module';
import { TenantModule } from './common/tenant/tenant.module';
import { TenantMiddleware } from './common/tenant/tenant.middleware';
import { AuthModule } from './common/auth/auth.module';
import { StorageModule } from './common/storage/storage.module';

import { HealthModule } from './modules/health/health.module';
import { CabinetsModule } from './modules/cabinets/cabinets.module';
import { UsersModule } from './modules/users/users.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { GrilleHoraireModule } from './modules/grille-horaire/grille-horaire.module';
import { TendersModule } from './modules/tenders/tenders.module';
import { EventsModule } from './modules/events/events.module';
import { TenderDocumentsModule } from './modules/tender-documents/tender-documents.module';
import { EventDocumentsModule } from './modules/event-documents/event-documents.module';
import { PricingCoefficientsModule } from './modules/pricing-coefficients/pricing-coefficients.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { CompetitiveIntelModule } from './modules/competitive-intel/competitive-intel.module';
import { ConsultantsModule } from './modules/consultants/consultants.module';
import { ReferencesModule } from './modules/references/references.module';
import { ProposalsModule } from './modules/proposals/proposals.module';
import { ProposalTemplatesModule } from './modules/proposal-templates/proposal-templates.module';

// Sprint 5a — Veille automatique
import { WatchDomainsModule } from './modules/watch-domains/watch-domains.module';
import { ScrapedTendersModule } from './modules/scraped-tenders/scraped-tenders.module';
import { ScrapersModule } from './modules/scrapers/scrapers.module';
import { MatchingModule } from './modules/matching/matching.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { ClaudeModule } from './modules/claude/claude.module';
import { CronModule } from './modules/cron/cron.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    PlatformCoreModule,
    PlatformModule, TenantModule, AuthModule, StorageModule,

    // Business modules
    HealthModule, CabinetsModule, UsersModule,
    InvitationsModule, ActivitiesModule, GrilleHoraireModule,
    TendersModule, EventsModule, TenderDocumentsModule, EventDocumentsModule,
    PricingCoefficientsModule, PricingModule, CompetitiveIntelModule,
    ConsultantsModule, ReferencesModule,ProposalsModule,
    ProposalTemplatesModule,

    // Sprint 5a — Veille
    AlertsModule, MatchingModule, WatchDomainsModule, ScrapedTendersModule, ScrapersModule,J360Module,ClaudeModule,AnalyticsModule,
    CronModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
