-- Sprint 3: Pricing engine + competitive intel

CREATE TYPE "PricingCoefficientCategory" AS ENUM (
  'SECTOR', 'COMPLEXITY', 'URGENCY', 'RECURRENCE',
  'STRATEGIC', 'VOLUME', 'GEOGRAPHY', 'CUSTOM'
);

CREATE TYPE "CompetitiveIntelSource" AS ENUM (
  'OFFICIAL_NOTIFICATION', 'PUBLIC_ANNOUNCEMENT', 'RUMOR', 'SELF_REPORTED', 'OTHER'
);

CREATE TABLE "pricing_coefficients" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "cabinet_id"  UUID NOT NULL,
    "code"        VARCHAR(100) NOT NULL,
    "label"       VARCHAR(200) NOT NULL,
    "category"    "PricingCoefficientCategory" NOT NULL,
    "multiplier"  DECIMAL(5,3) NOT NULL,
    "description" TEXT,
    "is_system"   BOOLEAN NOT NULL DEFAULT false,
    "is_active"   BOOLEAN NOT NULL DEFAULT true,
    "sort_order"  INTEGER NOT NULL DEFAULT 0,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pricing_coefficients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pricing_coefficients_cabinet_id_code_key"
  ON "pricing_coefficients"("cabinet_id", "code");
CREATE INDEX "pricing_coefficients_cabinet_id_category_idx"
  ON "pricing_coefficients"("cabinet_id", "category");

ALTER TABLE "pricing_coefficients" ADD CONSTRAINT "pricing_coefficients_cabinet_id_fkey"
  FOREIGN KEY ("cabinet_id") REFERENCES "cabinets"("id") ON DELETE CASCADE ON UPDATE CASCADE;


CREATE TABLE "tender_pricings" (
    "id"                     UUID NOT NULL DEFAULT gen_random_uuid(),
    "tender_id"              UUID NOT NULL,
    "name"                   VARCHAR(200) NOT NULL,
    "associe_hours"          DECIMAL(8,2) NOT NULL DEFAULT 0,
    "manager_hours"          DECIMAL(8,2) NOT NULL DEFAULT 0,
    "senior_hours"           DECIMAL(8,2) NOT NULL DEFAULT 0,
    "junior_hours"           DECIMAL(8,2) NOT NULL DEFAULT 0,
    "assistant_hours"        DECIMAL(8,2) NOT NULL DEFAULT 0,
    "travel_cost"            DECIMAL(15,2) NOT NULL DEFAULT 0,
    "other_costs"            DECIMAL(15,2) NOT NULL DEFAULT 0,
    "other_costs_label"      VARCHAR(200),
    "coefficients_snapshot"  JSONB NOT NULL,
    "floor_margin_rate"      DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    "target_margin_rate"     DECIMAL(5,4) NOT NULL DEFAULT 0.25,
    "ceiling_margin_rate"    DECIMAL(5,4) NOT NULL DEFAULT 0.40,
    "base_cost"              DECIMAL(15,2) NOT NULL,
    "adjusted_cost"          DECIMAL(15,2) NOT NULL,
    "floor_price"            DECIMAL(15,2) NOT NULL,
    "target_price"           DECIMAL(15,2) NOT NULL,
    "ceiling_price"          DECIMAL(15,2) NOT NULL,
    "currency"               VARCHAR(3) NOT NULL DEFAULT 'XOF',
    "notes"                  TEXT,
    "is_active"              BOOLEAN NOT NULL DEFAULT true,
    "created_at"             TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"             TIMESTAMPTZ(6) NOT NULL,
    "created_by_id"          UUID,

    CONSTRAINT "tender_pricings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tender_pricings_tender_id_idx" ON "tender_pricings"("tender_id");

ALTER TABLE "tender_pricings" ADD CONSTRAINT "tender_pricings_tender_id_fkey"
  FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tender_pricings" ADD CONSTRAINT "tender_pricings_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


CREATE TABLE "competitive_intels" (
    "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
    "tender_id"         UUID NOT NULL,
    "competitor_name"   VARCHAR(200) NOT NULL,
    "competitor_price"  DECIMAL(15,2),
    "currency"          VARCHAR(3) NOT NULL DEFAULT 'XOF',
    "is_winner"         BOOLEAN NOT NULL DEFAULT false,
    "source"            "CompetitiveIntelSource" NOT NULL DEFAULT 'OTHER',
    "notes"             TEXT,
    "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id"     UUID,

    CONSTRAINT "competitive_intels_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "competitive_intels_tender_id_idx" ON "competitive_intels"("tender_id");
CREATE INDEX "competitive_intels_competitor_name_idx" ON "competitive_intels"("competitor_name");

ALTER TABLE "competitive_intels" ADD CONSTRAINT "competitive_intels_tender_id_fkey"
  FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "competitive_intels" ADD CONSTRAINT "competitive_intels_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Grants app role
GRANT SELECT, INSERT, UPDATE, DELETE ON "pricing_coefficients" TO tenderpro;
GRANT SELECT, INSERT, UPDATE, DELETE ON "tender_pricings" TO tenderpro;
GRANT SELECT, INSERT, UPDATE, DELETE ON "competitive_intels" TO tenderpro;
