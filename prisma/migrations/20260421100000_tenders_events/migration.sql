-- Sprint 2: Tenders (appels d'offre) + Events (manifestations)

-- CreateEnum
CREATE TYPE "TenderStage" AS ENUM ('WATCHING', 'QUALIFICATION', 'EOI', 'SHORTLISTED', 'PREPARING', 'SUBMITTED', 'NEGOTIATION', 'WON', 'LOST', 'CANCELLED');
CREATE TYPE "TenderSource" AS ENUM ('SIGMAP', 'WORLD_BANK', 'AFDB', 'BOAD', 'EU', 'AFD', 'USAID', 'GIZ', 'UNGM', 'PRIVATE', 'OTHER');
CREATE TYPE "TenderType" AS ENUM ('AMI', 'AAP', 'DIRECT', 'RESTRICTED', 'OPEN', 'PREQUAL');
CREATE TYPE "EventType" AS ENUM ('CONFERENCE', 'SALON', 'TRAINING', 'NETWORKING', 'CLIENT_MEETING', 'WEBINAR', 'OTHER');
CREATE TYPE "EventStage" AS ENUM ('IDENTIFIED', 'REGISTERED', 'ATTENDED', 'FOLLOW_UP', 'ROI_MEASURED', 'CANCELLED');

-- CreateTable Tender
CREATE TABLE "tenders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cabinet_id" UUID NOT NULL,
    "reference" VARCHAR(100),
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "client_name" VARCHAR(300),
    "sector" VARCHAR(200),
    "source" "TenderSource" NOT NULL DEFAULT 'OTHER',
    "type" "TenderType" NOT NULL DEFAULT 'OPEN',
    "country" "Country",
    "stage" "TenderStage" NOT NULL DEFAULT 'WATCHING',
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMPTZ(6),
    "submission_deadline" TIMESTAMPTZ(6),
    "decision_expected_at" TIMESTAMPTZ(6),
    "start_date" DATE,
    "budget_indicative" DECIMAL(15,2),
    "our_proposed_amount" DECIMAL(15,2),
    "won_amount" DECIMAL(15,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'XOF',
    "source_url" TEXT,
    "lead_user_id" UUID,
    "lost_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "tenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable TenderTransition
CREATE TABLE "tender_transitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tender_id" UUID NOT NULL,
    "from_stage" "TenderStage",
    "to_stage" "TenderStage" NOT NULL,
    "note" TEXT,
    "performed_by_id" UUID,
    "performed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable Event
CREATE TABLE "events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cabinet_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "type" "EventType" NOT NULL DEFAULT 'CONFERENCE',
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "location" VARCHAR(300),
    "city" VARCHAR(100),
    "country" "Country",
    "is_virtual" BOOLEAN NOT NULL DEFAULT false,
    "stage" "EventStage" NOT NULL DEFAULT 'IDENTIFIED',
    "registration_cost" DECIMAL(12,2),
    "travel_cost" DECIMAL(12,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'XOF',
    "expected_leads" INTEGER,
    "actual_leads" INTEGER,
    "converted_leads" INTEGER,
    "roi_notes" TEXT,
    "url" TEXT,
    "lead_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable EventTransition
CREATE TABLE "event_transitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "from_stage" "EventStage",
    "to_stage" "EventStage" NOT NULL,
    "note" TEXT,
    "performed_by_id" UUID,
    "performed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_transitions_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "tenders_cabinet_id_stage_idx" ON "tenders"("cabinet_id", "stage");
CREATE INDEX "tenders_cabinet_id_is_open_idx" ON "tenders"("cabinet_id", "is_open");
CREATE INDEX "tenders_cabinet_id_submission_deadline_idx" ON "tenders"("cabinet_id", "submission_deadline");
CREATE INDEX "tenders_cabinet_id_lead_user_id_idx" ON "tenders"("cabinet_id", "lead_user_id");
CREATE INDEX "tender_transitions_tender_id_performed_at_idx" ON "tender_transitions"("tender_id", "performed_at");
CREATE INDEX "events_cabinet_id_stage_idx" ON "events"("cabinet_id", "stage");
CREATE INDEX "events_cabinet_id_starts_at_idx" ON "events"("cabinet_id", "starts_at");
CREATE INDEX "event_transitions_event_id_performed_at_idx" ON "event_transitions"("event_id", "performed_at");

-- Foreign keys
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "cabinets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_lead_user_id_fkey" FOREIGN KEY ("lead_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tender_transitions" ADD CONSTRAINT "tender_transitions_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tender_transitions" ADD CONSTRAINT "tender_transitions_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "cabinets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_lead_user_id_fkey" FOREIGN KEY ("lead_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_transitions" ADD CONSTRAINT "event_transitions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_transitions" ADD CONSTRAINT "event_transitions_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Grants pour le rôle app (cohérent avec Sprint 1)
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenders" TO tenderpro;
GRANT SELECT, INSERT, UPDATE, DELETE ON "tender_transitions" TO tenderpro;
GRANT SELECT, INSERT, UPDATE, DELETE ON "events" TO tenderpro;
GRANT SELECT, INSERT, UPDATE, DELETE ON "event_transitions" TO tenderpro;
