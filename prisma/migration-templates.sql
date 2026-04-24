-- Migration : proposal_templates

CREATE TABLE IF NOT EXISTS proposal_templates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id              UUID NOT NULL REFERENCES cabinets(id) ON DELETE CASCADE,
  code                    TEXT NOT NULL,
  label                   TEXT NOT NULL,
  description             TEXT,
  understanding_prompt    TEXT NOT NULL,
  methodology_prompt      TEXT NOT NULL,
  planning_prompt         TEXT NOT NULL,
  team_prompt             TEXT NOT NULL,
  typical_team_size       INTEGER DEFAULT 5,
  typical_duration_months INTEGER,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  is_system               BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT proposal_templates_cabinet_code_unique UNIQUE (cabinet_id, code)
);

CREATE INDEX IF NOT EXISTS proposal_templates_cabinet_id_idx ON proposal_templates(cabinet_id);

-- Ajout colonne template_code dans tender_proposals
ALTER TABLE tender_proposals ADD COLUMN IF NOT EXISTS template_code TEXT;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE proposal_templates TO tenderpro;

SELECT 'proposal_templates' AS table_name, COUNT(*) AS rows FROM proposal_templates;
