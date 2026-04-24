/*
  Warnings:

  - A unique constraint covering the columns `[source,external_ref]` on the table `scraped_tenders` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "activities" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "alerts" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "cabinets" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "competitive_intels" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "event_documents" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "event_transitions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "events" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "grille_horaire" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pricing_coefficients" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "scraped_tenders" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "scraper_runs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tender_documents" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tender_pricings" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tender_transitions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tenders" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "watch_domains" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "j360_configs" (
    "id" TEXT NOT NULL,
    "cabinetId" UUID NOT NULL,
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tradeIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "announceTypes" TEXT[] DEFAULT ARRAY['MC']::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxPagesPerRun" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "j360_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "j360_trade_catalog" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "categories" JSONB NOT NULL,

    CONSTRAINT "j360_trade_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "j360_configs_cabinetId_key" ON "j360_configs"("cabinetId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "scraped_tenders_source_external_ref_key" ON "scraped_tenders"("source", "external_ref");

-- AddForeignKey
ALTER TABLE "j360_configs" ADD CONSTRAINT "j360_configs_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "cabinets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "scraped_tenders_deadline_idx" RENAME TO "scraped_tenders_submission_deadline_idx";

-- RenameIndex
ALTER INDEX "watch_domains_active_idx" RENAME TO "watch_domains_is_active_idx";
