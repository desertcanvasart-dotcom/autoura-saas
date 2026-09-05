-- =====================================================================
-- 323 — attraction aliases: day wording resolves through DATA, not code
-- =====================================================================
-- The engine matched attractions by substring, with a ~20-entry hardcoded
-- name map inside lib/auto-pricing-service.ts as the only vocabulary
-- (A-item 13). An operator whose programmes say "the citadel" cannot teach
-- the engine anything without a deploy. This table is the mechanism ported
-- from the sibling: alias → canonical fee name, resolved BEFORE the
-- catalogue lookup; a canonical may join several fees with ' + ' for combo
-- tickets ("Giza Plateau" → "Pyramids of Giza + Sphinx Area").
--
-- Resolution order at pricing time (see lib/pricing/attraction-aliases.ts):
--   1. day.attraction_ids — explicit picks; they WIN and silence wording.
--   2. alias rows — tenant's own first, then the global catalogue rows.
--   3. the historical hardcoded map, kept as a last-resort fallback so
--      nothing regresses on installs whose alias table is still empty.
--
-- tenant_id NULL = global catalogue row, same convention as entrance_fees
-- (migrations 109/260).
-- =====================================================================

CREATE TABLE IF NOT EXISTS attraction_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  -- entrance_fees.attraction_name; ' + ' joins several fees (combo ticket).
  canonical TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One meaning per alias per scope (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS uq_attraction_aliases_tenant
  ON attraction_aliases (tenant_id, lower(alias)) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_attraction_aliases_global
  ON attraction_aliases (lower(alias)) WHERE tenant_id IS NULL;

ALTER TABLE attraction_aliases ENABLE ROW LEVEL SECURITY;

-- Tenants manage their own rows and read the global catalogue.
DROP POLICY IF EXISTS attraction_aliases_tenant_rw ON attraction_aliases;
CREATE POLICY attraction_aliases_tenant_rw ON attraction_aliases
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS attraction_aliases_global_read ON attraction_aliases;
CREATE POLICY attraction_aliases_global_read ON attraction_aliases
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL);

DROP POLICY IF EXISTS attraction_aliases_service ON attraction_aliases;
CREATE POLICY attraction_aliases_service ON attraction_aliases
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed the global catalogue with the map that lived in code. Canonicals are
-- substrings of entrance_fees.attraction_name (the lookup is ilike) — the
-- same invariant the code map documents.
INSERT INTO attraction_aliases (tenant_id, alias, canonical) VALUES
  (NULL, 'karnak',               'Karnak Temple'),
  (NULL, 'luxor temple',         'Luxor Temple'),
  (NULL, 'valley of kings',      'Valley of the Kings'),
  (NULL, 'hatshepsut',           'Hatshepsut Temple'),
  (NULL, 'colossi of memnon',    'Colossi of Memnon'),
  (NULL, 'edfu',                 'Edfu Temple'),
  (NULL, 'kom ombo',             'Kom Ombo Temple'),
  (NULL, 'kom-ombo',             'Kom Ombo Temple'),
  (NULL, 'komombo',              'Kom Ombo Temple'),
  (NULL, 'philae',               'Philae Temple'),
  (NULL, 'high dam',             'Aswan High Dam'),
  (NULL, 'aswan dam',            'Aswan High Dam'),
  (NULL, 'unfinished obelisk',   'Unfinished Obelisk'),
  (NULL, 'pyramid',              'Pyramids of Giza'),
  (NULL, 'pyramids',             'Pyramids of Giza'),
  (NULL, 'sphinx',               'Sphinx Area'),
  (NULL, 'great sphinx',         'Sphinx Area'),
  (NULL, 'egyptian museum',      'Egyptian Museum'),
  (NULL, 'cairo museum',         'Egyptian Museum'),
  (NULL, 'grand egyptian museum','Grand Egyptian Museum'),
  (NULL, 'gem',                  'Grand Egyptian Museum'),
  (NULL, 'citadel',              'Citadel of Saladin'),
  (NULL, 'saladin citadel',      'Citadel of Saladin'),
  (NULL, 'khan el khalili',      'Khan El Khalili'),
  (NULL, 'khan el-khalili',      'Khan El Khalili'),
  (NULL, 'abu simbel',           'Abu Simbel'),
  -- The combo-ticket shape the mechanism exists for:
  (NULL, 'giza plateau',         'Pyramids of Giza + Sphinx Area')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- Verify after applying:
--   SELECT count(*) FROM attraction_aliases WHERE tenant_id IS NULL; -- 27
--   Price a template whose day says "the Citadel" — it resolves to the
--   Citadel of Saladin fee through the table, not the code map.
-- =====================================================================
