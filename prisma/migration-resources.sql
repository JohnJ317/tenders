-- Migration SQL : consultants + references + reference_members
-- À exécuter avec : psql "postgresql://tenderpro_admin:tenderpro_admin@localhost:5432/tenderpro" -f migration-resources.sql
-- Après quoi : npx prisma db pull && npx prisma generate

-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE "ConsultantKind" AS ENUM ('INTERNAL', 'EXTERNAL', 'PARTNER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ReferenceStatus" AS ENUM ('COMPLETED', 'ONGOING', 'LOST', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- TABLE consultants
-- ============================================================
CREATE TABLE IF NOT EXISTS consultants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id       UUID NOT NULL REFERENCES cabinets(id) ON DELETE CASCADE,
  kind             "ConsultantKind" NOT NULL DEFAULT 'INTERNAL',
  full_name        VARCHAR(200) NOT NULL,
  title            VARCHAR(300),
  email            VARCHAR(200),
  phone            VARCHAR(50),
  years_experience INTEGER,
  skills           TEXT[] NOT NULL DEFAULT '{}',
  sectors          TEXT[] NOT NULL DEFAULT '{}',
  languages        TEXT[] NOT NULL DEFAULT '{}',
  cv_file_key      VARCHAR(500),
  cv_file_name     VARCHAR(300),
  daily_rate       NUMERIC(12, 2),
  currency         VARCHAR(3) NOT NULL DEFAULT 'XOF',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "consultants_cabinet_id_kind_idx"
  ON consultants(cabinet_id, kind);
CREATE INDEX IF NOT EXISTS "consultants_cabinet_id_is_active_idx"
  ON consultants(cabinet_id, is_active);

-- Permissions pour le user applicatif
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE consultants TO tenderpro;

-- ============================================================
-- TABLE references
-- Note : "references" est un mot réservé en SQL standard, on l'échappe partout
-- ============================================================
CREATE TABLE IF NOT EXISTS "references" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id      UUID NOT NULL REFERENCES cabinets(id) ON DELETE CASCADE,
  project_name    VARCHAR(500) NOT NULL,
  client_name     VARCHAR(300) NOT NULL,
  country         VARCHAR(50),
  sector          VARCHAR(200),
  description     TEXT NOT NULL,
  outcome         TEXT,
  budget          NUMERIC(15, 2),
  currency        VARCHAR(3) NOT NULL DEFAULT 'XOF',
  start_date      DATE,
  end_date        DATE,
  duration_months INTEGER,
  status          "ReferenceStatus" NOT NULL DEFAULT 'COMPLETED',
  tags            TEXT[] NOT NULL DEFAULT '{}',
  attachments     TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "references_cabinet_id_status_idx"
  ON "references"(cabinet_id, status);
CREATE INDEX IF NOT EXISTS "references_cabinet_id_sector_idx"
  ON "references"(cabinet_id, sector);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "references" TO tenderpro;

-- ============================================================
-- TABLE reference_members (pivot many-to-many)
-- ============================================================
CREATE TABLE IF NOT EXISTS reference_members (
  reference_id  UUID NOT NULL REFERENCES "references"(id) ON DELETE CASCADE,
  consultant_id UUID NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  role          VARCHAR(200),
  PRIMARY KEY (reference_id, consultant_id)
);

CREATE INDEX IF NOT EXISTS "reference_members_consultant_id_idx"
  ON reference_members(consultant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE reference_members TO tenderpro;

-- ============================================================
-- VALIDATION
-- ============================================================
SELECT 'consultants' AS table_name, COUNT(*) AS rows FROM consultants
UNION ALL
SELECT 'references', COUNT(*) FROM "references"
UNION ALL
SELECT 'reference_members', COUNT(*) FROM reference_members;
