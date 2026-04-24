-- Documents (AO et événements)

-- CreateEnum
CREATE TYPE "TenderDocumentCategory" AS ENUM (
  'DCE', 'TDR', 'METHODOLOGIE', 'CV',
  'OFFRE_TECHNIQUE', 'OFFRE_FINANCIERE',
  'ANNEXE', 'DECISION_ATTRIBUTION', 'CONTRAT',
  'CORRESPONDANCE', 'AUTRE'
);

CREATE TYPE "EventDocumentCategory" AS ENUM (
  'PROGRAMME', 'INVITATION', 'CARTE_VISITE',
  'COMPTE_RENDU', 'PHOTO', 'AUTRE'
);

-- CreateTable TenderDocument
CREATE TABLE "tender_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tender_id" UUID NOT NULL,
    "category" "TenderDocumentCategory" NOT NULL DEFAULT 'AUTRE',
    "filename" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(200) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "s3_key" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "uploaded_by_id" UUID,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable EventDocument
CREATE TABLE "event_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "category" "EventDocumentCategory" NOT NULL DEFAULT 'AUTRE',
    "filename" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(200) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "s3_key" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "uploaded_by_id" UUID,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_documents_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "tender_documents_s3_key_key" ON "tender_documents"("s3_key");
CREATE INDEX "tender_documents_tender_id_category_idx" ON "tender_documents"("tender_id", "category");
CREATE UNIQUE INDEX "event_documents_s3_key_key" ON "event_documents"("s3_key");
CREATE INDEX "event_documents_event_id_category_idx" ON "event_documents"("event_id", "category");

-- Foreign keys
ALTER TABLE "tender_documents" ADD CONSTRAINT "tender_documents_tender_id_fkey"
  FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tender_documents" ADD CONSTRAINT "tender_documents_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_documents" ADD CONSTRAINT "event_documents_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_documents" ADD CONSTRAINT "event_documents_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Grants app role
GRANT SELECT, INSERT, UPDATE, DELETE ON "tender_documents" TO tenderpro;
GRANT SELECT, INSERT, UPDATE, DELETE ON "event_documents" TO tenderpro;
