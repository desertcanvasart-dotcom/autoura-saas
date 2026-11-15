-- ============================================================================
-- 469 — the agency's zones: the parts of a city that change a transfer's price
-- ============================================================================
-- Operator, 2026-11-15/16 (docs/transport-zones/PLAN.md, step 1): a Cairo
-- airport transfer costs one price to a Downtown hotel and another to a 6th of
-- October one; a Luxor transfer to a West Bank hotel costs more than to an
-- East Bank one. Each city has its own list of zones, ONE of which is the
-- default — the zone a hotel or a transport card with no zone belongs to.
--
-- A table, not a vocabulary kind: a zone belongs to a CITY, and vocabulary
-- keys are unique per company across all cities. Each company keeps its own
-- list (white-label rule) — nothing is seeded.
--
-- This step only stores the lists. Hotels (step 2) and transport cards
-- (step 3) point at a zone by its key; the engine (step 4) reads them.
--
-- Idempotent: safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS city_zones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  city        TEXT NOT NULL CHECK (btrim(city) <> ''),
  -- Stable: hotels and cards will point at it, so a rename keeps the key.
  key         TEXT NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9_]{0,59}$'),
  label       TEXT NOT NULL CHECK (btrim(label) <> ''),
  is_default  BOOLEAN NOT NULL DEFAULT false,
  rank        INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A zone key is unique within its city (cities compared ignoring capitals,
-- as the rate pages store them as typed).
CREATE UNIQUE INDEX IF NOT EXISTS city_zones_key_idx
  ON city_zones (tenant_id, lower(btrim(city)), key);

-- At most one default per city.
CREATE UNIQUE INDEX IF NOT EXISTS city_zones_one_default_idx
  ON city_zones (tenant_id, lower(btrim(city)))
  WHERE is_default;

ALTER TABLE city_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS city_zones_tenant ON city_zones;
CREATE POLICY city_zones_tenant ON city_zones
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS city_zones_service ON city_zones;
CREATE POLICY city_zones_service ON city_zones
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
