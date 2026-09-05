-- ============================================================================
-- 334 — tenant_vocabularies: each agency's own words, as data
-- ============================================================================
-- Tiers, supplier types, board basis, vehicle types, cabin types, meal types
-- and hotel property types have been hardcoded lists — 19 files for the four
-- tiers alone — so every agency spoke the platform's words: "deluxe" even if
-- it sells "5 star", "Transport Company" even if it says "fleet partner",
-- seven vehicle types even if it runs two. (Operator, 2026-09-06: "any agency
-- can start from scratch and build it around its needs, not less, not more,
-- using their own words.")
--
-- This table is the one mechanism for all of them: per tenant, per KIND, an
-- ordered list of (key, label). The KEY is the stable machine value stored on
-- rate rows, quotes and variations; the LABEL is what the agency reads and
-- may rename at any time. `behavior` is for supplier types only: the built-in
-- kind that decides what the app DOES with a supplier (a Properties tab for
-- hotels, rate linkage for transport) — an agency renames or hides the kinds,
-- and may add plain extra ones that carry no behaviour.
--
-- Egypt is a PRESET, not a special case: seed_tenant_vocabulary() writes the
-- default vocabulary for a tenant (all kinds or one), an AFTER INSERT trigger
-- runs it for every new tenant (the 327 pattern), this migration backfills
-- every existing tenant, and reset_tenant_vocabulary() lets an admin return a
-- kind to the preset from the settings screen.
--
-- Cities are NOT here: the destination catalog (294) already gives each
-- tenant its own selection of countries and cities.
--
-- Step 1 of the vocabulary work: the table, the preset and the seeding. The
-- UI sweep and the CHECK-constraint relaxations follow in later migrations.
-- Idempotent: safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS tenant_vocabularies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  kind TEXT NOT NULL CHECK (kind IN (
    'tier', 'supplier_type', 'board_basis', 'vehicle_type',
    'cruise_cabin', 'sleeper_cabin', 'meal_type', 'hotel_property_type'
  )),
  -- Stable machine value: lowercase slug, never shown, never renamed.
  key TEXT NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9_]{0,59}$'),
  -- The agency's word.
  label TEXT NOT NULL CHECK (btrim(label) <> ''),
  description TEXT,
  -- supplier_type only: the built-in kind this entry behaves as.
  behavior TEXT,
  rank INTEGER NOT NULL DEFAULT 0,
  -- Kind-specific extras (vehicle_type: {"min_pax": 1, "max_pax": 2}).
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tenant_vocabularies_unique_key UNIQUE (tenant_id, kind, key),
  CONSTRAINT tenant_vocabularies_behavior_scope
    CHECK (behavior IS NULL OR kind = 'supplier_type')
);

CREATE INDEX IF NOT EXISTS idx_tenant_vocabularies_lookup
  ON tenant_vocabularies (tenant_id, kind, rank);

ALTER TABLE tenant_vocabularies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_vocabularies_tenant ON tenant_vocabularies;
CREATE POLICY tenant_vocabularies_tenant ON tenant_vocabularies
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS tenant_vocabularies_service ON tenant_vocabularies;
CREATE POLICY tenant_vocabularies_service ON tenant_vocabularies
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- The Egypt preset. One place. Skips keys the tenant already has, so it can
-- be re-run to fill gaps without touching what the agency has written.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seed_tenant_vocabulary(p_tenant UUID, p_kind TEXT DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  inserted INTEGER := 0;
  n INTEGER;
BEGIN
  IF p_kind IS NULL OR p_kind = 'tier' THEN
    INSERT INTO tenant_vocabularies (tenant_id, kind, key, label, description, rank) VALUES
      (p_tenant, 'tier', 'budget',   'Budget',   'Cost-effective options',    1),
      (p_tenant, 'tier', 'standard', 'Standard', 'Comfortable mid-range',     2),
      (p_tenant, 'tier', 'deluxe',   'Deluxe',   'Superior quality',          3),
      (p_tenant, 'tier', 'luxury',   'Luxury',   'Top-tier VIP experience',   4)
    ON CONFLICT ON CONSTRAINT tenant_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'supplier_type' THEN
    INSERT INTO tenant_vocabularies (tenant_id, kind, key, label, behavior, rank) VALUES
      (p_tenant, 'supplier_type', 'hotel',             'Hotel',             'hotel',             1),
      (p_tenant, 'supplier_type', 'transport_company', 'Transport Company', 'transport_company', 2),
      (p_tenant, 'supplier_type', 'airline',           'Airline',           'airline',           3),
      (p_tenant, 'supplier_type', 'train_operator',    'Train Operator',    'train_operator',    4),
      (p_tenant, 'supplier_type', 'driver',            'Driver',            'driver',            5),
      (p_tenant, 'supplier_type', 'guide',             'Guide',             'guide',             6),
      (p_tenant, 'supplier_type', 'cruise',            'Cruise',            'cruise',            7),
      (p_tenant, 'supplier_type', 'activity_provider', 'Activity Provider', 'activity_provider', 8),
      (p_tenant, 'supplier_type', 'attraction',        'Attraction',        'attraction',        9),
      (p_tenant, 'supplier_type', 'tour_operator',     'Tour Operator',     'tour_operator',     10),
      (p_tenant, 'supplier_type', 'ground_handler',    'Ground Handler',    'ground_handler',    11),
      (p_tenant, 'supplier_type', 'restaurant',        'Restaurant',        'restaurant',        12),
      (p_tenant, 'supplier_type', 'shop',              'Shop',              'shop',              13),
      (p_tenant, 'supplier_type', 'other',             'Other',             'other',             14)
    ON CONFLICT ON CONSTRAINT tenant_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'board_basis' THEN
    INSERT INTO tenant_vocabularies (tenant_id, kind, key, label, rank) VALUES
      (p_tenant, 'board_basis', 'ro', 'Room Only',       1),
      (p_tenant, 'board_basis', 'bb', 'Bed & Breakfast', 2),
      (p_tenant, 'board_basis', 'hb', 'Half Board',      3),
      (p_tenant, 'board_basis', 'fb', 'Full Board',      4),
      (p_tenant, 'board_basis', 'ai', 'All Inclusive',   5)
    ON CONFLICT ON CONSTRAINT tenant_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'vehicle_type' THEN
    INSERT INTO tenant_vocabularies (tenant_id, kind, key, label, meta, rank) VALUES
      (p_tenant, 'vehicle_type', 'sedan',          'Sedan',          '{"min_pax": 1, "max_pax": 2}',  1),
      (p_tenant, 'vehicle_type', 'suv',            'SUV',            '{"min_pax": 1, "max_pax": 4}',  2),
      (p_tenant, 'vehicle_type', '4x4',            '4x4',            '{"min_pax": 1, "max_pax": 6}',  3),
      (p_tenant, 'vehicle_type', 'minivan',        'Minivan',        '{"min_pax": 3, "max_pax": 8}',  4),
      (p_tenant, 'vehicle_type', 'van',            'Van',            '{"min_pax": 9, "max_pax": 14}', 5),
      (p_tenant, 'vehicle_type', 'minibus',        'Minibus',        '{"min_pax": 15, "max_pax": 24}', 6),
      (p_tenant, 'vehicle_type', 'bus',            'Bus',            '{"min_pax": 25, "max_pax": 45}', 7),
      (p_tenant, 'vehicle_type', 'horse_carriage', 'Horse Carriage', '{"min_pax": 1, "max_pax": 4}',  8)
    ON CONFLICT ON CONSTRAINT tenant_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'cruise_cabin' THEN
    INSERT INTO tenant_vocabularies (tenant_id, kind, key, label, rank) VALUES
      (p_tenant, 'cruise_cabin', 'standard', 'Standard Cabin', 1),
      (p_tenant, 'cruise_cabin', 'deluxe',   'Deluxe Cabin',   2),
      (p_tenant, 'cruise_cabin', 'suite',    'Suite',          3)
    ON CONFLICT ON CONSTRAINT tenant_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'sleeper_cabin' THEN
    INSERT INTO tenant_vocabularies (tenant_id, kind, key, label, rank) VALUES
      (p_tenant, 'sleeper_cabin', 'half_twin', 'Half Twin Cabin', 1),
      (p_tenant, 'sleeper_cabin', 'single',    'Single Cabin',    2)
    ON CONFLICT ON CONSTRAINT tenant_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'meal_type' THEN
    INSERT INTO tenant_vocabularies (tenant_id, kind, key, label, rank) VALUES
      (p_tenant, 'meal_type', 'breakfast',  'Breakfast',  1),
      (p_tenant, 'meal_type', 'brunch',     'Brunch',     2),
      (p_tenant, 'meal_type', 'lunch',      'Lunch',      3),
      (p_tenant, 'meal_type', 'dinner',     'Dinner',     4),
      (p_tenant, 'meal_type', 'snack',      'Snack',      5),
      (p_tenant, 'meal_type', 'half_board', 'Half Board', 6),
      (p_tenant, 'meal_type', 'full_board', 'Full Board', 7)
    ON CONFLICT ON CONSTRAINT tenant_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'hotel_property_type' THEN
    INSERT INTO tenant_vocabularies (tenant_id, kind, key, label, rank) VALUES
      (p_tenant, 'hotel_property_type', 'hotel',      'Hotel',      1),
      (p_tenant, 'hotel_property_type', 'resort',     'Resort',     2),
      (p_tenant, 'hotel_property_type', 'apartment',  'Apartment',  3),
      (p_tenant, 'hotel_property_type', 'guesthouse', 'Guesthouse', 4),
      (p_tenant, 'hotel_property_type', 'cruise',     'Cruise',     5),
      (p_tenant, 'hotel_property_type', 'camp',       'Camp',       6)
    ON CONFLICT ON CONSTRAINT tenant_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  RETURN inserted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Every new tenant starts with the preset (the 327 pattern: a trigger, so
-- every creation path is covered — signup, super-admin, imports).
CREATE OR REPLACE FUNCTION seed_tenant_vocabulary_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM seed_tenant_vocabulary(NEW.id, NULL);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_seed_tenant_vocabulary ON tenants;
CREATE TRIGGER trg_seed_tenant_vocabulary
  AFTER INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION seed_tenant_vocabulary_on_insert();

-- "Reset to defaults" from the settings screen: the CALLER's tenant only,
-- one kind at a time. Everything the agency wrote for that kind goes and the
-- preset comes back.
CREATE OR REPLACE FUNCTION reset_tenant_vocabulary(p_kind TEXT)
RETURNS INTEGER AS $$
DECLARE
  t UUID := get_user_tenant_id();
BEGIN
  IF t IS NULL THEN
    RAISE EXCEPTION 'no tenant for caller';
  END IF;
  DELETE FROM tenant_vocabularies WHERE tenant_id = t AND kind = p_kind;
  RETURN seed_tenant_vocabulary(t, p_kind);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION reset_tenant_vocabulary(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_tenant_vocabulary(TEXT) TO authenticated;

-- Backfill: every existing tenant gets the preset (gaps only).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM tenants LOOP
    PERFORM seed_tenant_vocabulary(r.id, NULL);
  END LOOP;
END $$;

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT kind, count(*) FROM tenant_vocabularies GROUP BY 1 ORDER BY 1;
--   -- 8 kinds × tenant count; tier = 4 per tenant, supplier_type = 14
