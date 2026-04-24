/*
  Warnings:

  - The primary key for the `j360_configs` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[source,external_ref]` on the table `scraped_tenders` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `id` on the `j360_configs` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "j360_configs" DROP CONSTRAINT "j360_configs_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "j360_configs_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "tender_analyses" (
    "id" UUID NOT NULL,
    "tenderId" UUID NOT NULL,
    "estimatedBudget" DOUBLE PRECISION,
    "currency" TEXT,
    "deadlineIso" TIMESTAMP(3),
    "country" TEXT,
    "sector" TEXT,
    "summary" TEXT,
    "modelUsed" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "documentsCount" INTEGER NOT NULL,
    "totalPages" INTEGER,
    "confidence" TEXT,
    "rawResponse" JSONB,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'COMPLETED',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tender_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tender_analyses_tenderId_key" ON "tender_analyses"("tenderId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "scraped_tenders_source_external_ref_key" ON "scraped_tenders"("source", "external_ref");

-- AddForeignKey
ALTER TABLE "tender_analyses" ADD CONSTRAINT "tender_analyses_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
