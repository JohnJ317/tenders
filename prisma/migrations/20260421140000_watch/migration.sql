-- Sprint 5a: Veille automatique

CREATE TYPE "ScrapedTenderStatus" AS ENUM (
  'NEW',           -- fraîchement scrapé, pas encore traité
  'MATCHED',       -- matche au moins 1 WatchDomain
  'IGNORED',       -- ignoré (hors scope, deadline passée, etc.)
  'PROMOTED',      -- promu en Tender dans l'app
  'DISMISSED'      -- rejeté explicitement par un utilisateur
);

CREATE TYPE "AlertType" AS ENUM (
  'NEW_MATCH',           -- nouveau AO qui matche le watch
  'DEADLINE_APPROACHING', -- deadline d'un AO ouvert dans < 3 jours
  'SOURCE_ERROR'         -- un scraper a échoué (pour admin)
);

CREATE TYPE "ScraperStatus" AS ENUM (
  'SUCCESS',
  'PARTIAL',
  'FAILED',
  'SKIPPED'
);

-- Ajout de sources dans TenderSource (pour rester compatible avec l'enum existant,
-- on ne le modifie pas ici ; les nouvelles sources seront mappées vers OTHER si besoin)

-- =========================================================================
-- WatchDomain : configuration de veille par cabinet
-- =========================================================================

CREATE TABLE "watch_domains" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "cabinet_id"     UUID NOT NULL,
  "name"           VARCHAR(200) NOT NULL,
  "keywords"       TEXT[] NOT NULL DEFAULT '{}',
  "sectors"        TEXT[] NOT NULL DEFAULT '{}',
  "countries"      TEXT[] NOT NULL DEFAULT '{}',
  "sources"        TEXT[] NOT NULL DEFAULT '{}',
  "min_budget"     DECIMAL(15,2),
  "max_budget"     DECIMAL(15,2),
  "include_tenders" BOOLEAN NOT NULL DEFAULT true,
  "include_eoi"     BOOLEAN NOT NULL DEFAULT true,
  "is_active"      BOOLEAN NOT NULL DEFAULT true,
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "watch_domains_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "watch_domains_cabinet_id_idx" ON "watch_domains"("cabinet_id");
CREATE INDEX "watch_domains_active_idx" ON "watch_domains"("is_active");

ALTER TABLE "watch_domains" ADD CONSTRAINT "watch_domains_cabinet_id_fkey"
  FOREIGN KEY ("cabinet_id") REFERENCES "cabinets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =========================================================================
-- ScrapedTender : AO brut, shared par tous les cabinets
-- =========================================================================

CREATE TABLE "scraped_tenders" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "source"            VARCHAR(50) NOT NULL,
  "external_ref"      VARCHAR(300),
  "title"             TEXT NOT NULL,
  "description"       TEXT,
  "client_name"       VARCHAR(500),
  "sector"            VARCHAR(300),
  "country"           VARCHAR(50),
  "published_at"      TIMESTAMPTZ(6),
  "submission_deadline" TIMESTAMPTZ(6),
  "budget_indicative" DECIMAL(15,2),
  "currency"          VARCHAR(3),
  "source_url"        TEXT,
  "document_urls"     TEXT[] NOT NULL DEFAULT '{}',
  "is_eoi"            BOOLEAN NOT NULL DEFAULT false,
  "raw_data"          JSONB,
  "status"            "ScrapedTenderStatus" NOT NULL DEFAULT 'NEW',
  "matched_cabinet_ids" UUID[] NOT NULL DEFAULT '{}',
  "promoted_tender_id" UUID,
  "scraped_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at"      TIMESTAMPTZ(6),
  CONSTRAINT "scraped_tenders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scraped_tenders_source_external_ref_key"
  ON "scraped_tenders"("source", "external_ref")
  WHERE "external_ref" IS NOT NULL;

CREATE INDEX "scraped_tenders_status_idx" ON "scraped_tenders"("status");
CREATE INDEX "scraped_tenders_country_idx" ON "scraped_tenders"("country");
CREATE INDEX "scraped_tenders_deadline_idx" ON "scraped_tenders"("submission_deadline");
CREATE INDEX "scraped_tenders_scraped_at_idx" ON "scraped_tenders"("scraped_at" DESC);

-- FK optionnelle vers Tender (si promu)
ALTER TABLE "scraped_tenders" ADD CONSTRAINT "scraped_tenders_promoted_tender_id_fkey"
  FOREIGN KEY ("promoted_tender_id") REFERENCES "tenders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =========================================================================
-- Alert : notifications par cabinet
-- =========================================================================

CREATE TABLE "alerts" (
  "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
  "cabinet_id"         UUID NOT NULL,
  "type"               "AlertType" NOT NULL,
  "title"              VARCHAR(500) NOT NULL,
  "message"            TEXT,
  "scraped_tender_id"  UUID,
  "tender_id"          UUID,
  "read_at"            TIMESTAMPTZ(6),
  "email_sent_at"      TIMESTAMPTZ(6),
  "dismissed_at"       TIMESTAMPTZ(6),
  "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "alerts_cabinet_id_idx" ON "alerts"("cabinet_id");
CREATE INDEX "alerts_cabinet_id_read_at_idx" ON "alerts"("cabinet_id", "read_at");
CREATE INDEX "alerts_created_at_idx" ON "alerts"("created_at" DESC);

ALTER TABLE "alerts" ADD CONSTRAINT "alerts_cabinet_id_fkey"
  FOREIGN KEY ("cabinet_id") REFERENCES "cabinets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_scraped_tender_id_fkey"
  FOREIGN KEY ("scraped_tender_id") REFERENCES "scraped_tenders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_tender_id_fkey"
  FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =========================================================================
-- ScraperRun : historique d'exécution des scrapers
-- =========================================================================

CREATE TABLE "scraper_runs" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "source"       VARCHAR(50) NOT NULL,
  "started_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at"  TIMESTAMPTZ(6),
  "status"       "ScraperStatus" NOT NULL DEFAULT 'SUCCESS',
  "items_found"  INTEGER NOT NULL DEFAULT 0,
  "items_new"    INTEGER NOT NULL DEFAULT 0,
  "items_error"  INTEGER NOT NULL DEFAULT 0,
  "error_message" TEXT,
  CONSTRAINT "scraper_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scraper_runs_source_started_at_idx" ON "scraper_runs"("source", "started_at" DESC);
CREATE INDEX "scraper_runs_started_at_idx" ON "scraper_runs"("started_at" DESC);

-- =========================================================================
-- Grants pour le rôle applicatif
-- =========================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON "watch_domains" TO tenderpro;
GRANT SELECT, INSERT, UPDATE, DELETE ON "scraped_tenders" TO tenderpro;
GRANT SELECT, INSERT, UPDATE, DELETE ON "alerts" TO tenderpro;
GRANT SELECT, INSERT, UPDATE, DELETE ON "scraper_runs" TO tenderpro;

-- RLS : watch_domains et alerts sont scopés par cabinet
-- scraped_tenders et scraper_runs sont partagés (pas de RLS)
ALTER TABLE "watch_domains" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "watch_domains" FORCE ROW LEVEL SECURITY;
CREATE POLICY "watch_domains_tenant_isolation" ON "watch_domains"
  USING (cabinet_id = app_current_tenant())
  WITH CHECK (cabinet_id = app_current_tenant());

ALTER TABLE "alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alerts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "alerts_tenant_isolation" ON "alerts"
  USING (cabinet_id = app_current_tenant())
  WITH CHECK (cabinet_id = app_current_tenant());
