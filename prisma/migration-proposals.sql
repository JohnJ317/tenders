-- Migration : tender_proposals
-- psql "postgresql://tenderpro_admin:tenderpro_admin@localhost:5432/tenderpro" -f migration-proposals.sql

-- Enum
DO $$ BEGIN
  CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'READY', 'SUBMITTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Table
CREATE TABLE IF NOT EXISTS tender_proposals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id          UUID NOT NULL UNIQUE REFERENCES tenders(id) ON DELETE CASCADE,
  selected_team      JSONB,
  selected_references JSONB,
  understanding      TEXT,
  methodology        TEXT,
  planning           TEXT,
  status             "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
  generated_at       TIMESTAMPTZ,
  last_regenerated   JSONB,
  tokens_used        INTEGER DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "tender_proposals_tender_id_idx"
  ON tender_proposals(tender_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tender_proposals TO tenderpro;

SELECT 'tender_proposals' AS table_name, COUNT(*) AS rows FROM tender_proposals;
