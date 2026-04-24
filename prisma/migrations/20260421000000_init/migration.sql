-- ============================================================================
-- BOOTSTRAP — rôle app runtime `tenderpro`
-- ============================================================================
-- En local, ce rôle est créé par docker/init-db.sql. Sur une Postgres managée
-- (Railway, Neon, RDS…) l'init-db.sql ne tourne pas, donc les GRANTs plus bas
-- échouent et font crasher la migration. On crée le rôle ici de façon
-- idempotente pour que la migration soit self-contained partout.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tenderpro') THEN
    CREATE ROLE tenderpro LOGIN PASSWORD 'tenderpro';
  END IF;
END
$$;

-- GRANT CONNECT sur la DB courante (nom dynamique car il diffère selon l'environnement).
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO tenderpro', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO tenderpro;

-- CreateEnum
CREATE TYPE "CabinetStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Country" AS ENUM ('CI', 'SN', 'BF', 'ML', 'TG', 'BJ', 'NE', 'GW', 'CM', 'GA', 'CD', 'MG', 'OTHER');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN_CABINET', 'ASSOCIE', 'MANAGER', 'CONSULTANT');

-- CreateEnum
CREATE TYPE "Grade" AS ENUM ('ASSOCIE', 'MANAGER', 'SENIOR', 'JUNIOR', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CAC', 'AUDIT_CONTRACTUEL', 'EC_TENUE', 'EC_ETATS_FINANCIERS', 'DUE_DILIGENCE', 'AUDIT_BAILLEUR', 'CONSEIL_FISCAL', 'EVALUATION', 'CONSEIL_FINANCIER', 'AUTRE');

-- CreateTable
CREATE TABLE "cabinets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "country" "Country" NOT NULL DEFAULT 'CI',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'XOF',
    "vatRate" DECIMAL(5,4) NOT NULL DEFAULT 0.18,
    "language" VARCHAR(5) NOT NULL DEFAULT 'fr',
    "status" "CabinetStatus" NOT NULL DEFAULT 'TRIAL',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cabinets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cabinet_id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255),
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "role" "Role" NOT NULL,
    "grade" "Grade",
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cabinet_id" UUID NOT NULL,
    "type" "ActivityType" NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grille_horaire" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cabinet_id" UUID NOT NULL,
    "grade" "Grade" NOT NULL,
    "hourly_rate" DECIMAL(12,2) NOT NULL,
    "daily_rate" DECIMAL(12,2),
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "grille_horaire_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cabinets_status_idx" ON "cabinets"("status");
CREATE INDEX "users_cabinet_id_idx" ON "users"("cabinet_id");
CREATE UNIQUE INDEX "users_cabinet_id_email_key" ON "users"("cabinet_id", "email");
CREATE INDEX "activities_cabinet_id_idx" ON "activities"("cabinet_id");
CREATE INDEX "grille_horaire_cabinet_id_grade_effective_from_idx" ON "grille_horaire"("cabinet_id", "grade", "effective_from");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "cabinets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activities" ADD CONSTRAINT "activities_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "cabinets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grille_horaire" ADD CONSTRAINT "grille_horaire_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "cabinets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY — isolation multi-tenant au niveau base
-- ============================================================================
-- L'idée : chaque requête de l'app runtime passe d'abord par une transaction qui
-- exécute `SELECT set_config('app.current_tenant_id', <uuid>, true)`.
-- Les policies ci-dessous lisent ce paramètre et filtrent les lignes accessibles.
--
-- Le rôle `tenderpro_admin` (owner du schéma, utilisé pour les migrations) bypass
-- automatiquement les policies — c'est géré par Postgres via la propriété d'objet.
-- Le rôle `tenderpro` (app runtime, non-propriétaire) est strictement soumis.

-- Helper function — retourne le tenant courant ou NULL si non défini.
-- On utilise current_setting(..., true) avec missing_ok=true pour ne pas lever d'erreur.
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
$$ LANGUAGE SQL STABLE;

-- Grants pour le rôle app
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tenderpro;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tenderpro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tenderpro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO tenderpro;

-- ===== Table cabinets =====
-- Cas particulier : c'est la table des tenants elle-même. Un user authentifié
-- ne voit QUE son propre cabinet. Les opérations de signup/login se font via
-- le rôle admin (bypass RLS).
ALTER TABLE "cabinets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cabinets" FORCE ROW LEVEL SECURITY;

CREATE POLICY cabinets_isolation ON "cabinets"
  USING (id = app_current_tenant())
  WITH CHECK (id = app_current_tenant());

-- ===== Table users =====
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

CREATE POLICY users_isolation ON "users"
  USING (cabinet_id = app_current_tenant())
  WITH CHECK (cabinet_id = app_current_tenant());

-- ===== Table activities =====
ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activities" FORCE ROW LEVEL SECURITY;

CREATE POLICY activities_isolation ON "activities"
  USING (cabinet_id = app_current_tenant())
  WITH CHECK (cabinet_id = app_current_tenant());

-- ===== Table grille_horaire =====
ALTER TABLE "grille_horaire" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grille_horaire" FORCE ROW LEVEL SECURITY;

CREATE POLICY grille_horaire_isolation ON "grille_horaire"
  USING (cabinet_id = app_current_tenant())
  WITH CHECK (cabinet_id = app_current_tenant());

-- Note sur FORCE ROW LEVEL SECURITY :
-- Sans FORCE, le owner d'une table (ici tenderpro_admin) bypass les policies.
-- Avec FORCE, MÊME le owner y est soumis s'il n'est pas superuser. On laisse
-- FORCE activé pour que seules les migrations (qui désactivent explicitement RLS
-- avec SET LOCAL rls.bypass = on si besoin) puissent faire des ops cross-tenant.
