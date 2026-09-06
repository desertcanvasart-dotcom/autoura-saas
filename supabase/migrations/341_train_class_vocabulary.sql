-- ============================================================================
-- 341 — day-train classes come from the tenant's vocabulary
-- ============================================================================
-- The Add Train Rate form offered five classes from a list hardcoded in the
-- app (First / Second AC / Second / Third / Business) and stored the LABEL
-- in train_rates.class_type. Sleeping-train cabins have been a vocabulary
-- kind since 334; day-train classes were never added, so an agency selling
-- "Spanish Talgo" or "Premium" seats had nowhere to say so. This adds the
-- `train_class` kind, seeds the five words into every tenant, and re-files
-- existing rows under the key the vocabulary uses ("First Class" →
-- first_class, matching lib/vocabulary slugifyKey).
--
-- seed_tenant_vocabulary is redefined in full (the preset lives in one
-- place, and this is now that place; 334's body is unchanged apart from the
-- new block).
--
-- Idempotent: safe to re-run.

BEGIN;

ALTER TABLE tenant_vocabularies DROP CONSTRAINT IF EXISTS tenant_vocabularies_kind_check;
ALTER TABLE tenant_vocabularies ADD CONSTRAINT tenant_vocabularies_kind_check
  CHECK (kind IN (
    'tier', 'supplier_type', 'board_basis', 'vehicle_type',
    'cruise_cabin', 'sleeper_cabin', 'meal_type', 'hotel_property_type',
    'train_class'
  ));

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

  -- Day-train seat classes (new in 341). The five words the app hardcoded.
  IF p_kind IS NULL OR p_kind = 'train_class' THEN
    INSERT INTO tenant_vocabularies (tenant_id, kind, key, label, rank) VALUES
      (p_tenant, 'train_class', 'first_class',     'First Class',     1),
      (p_tenant, 'train_class', 'second_class_ac', 'Second Class AC', 2),
      (p_tenant, 'train_class', 'second_class',    'Second Class',    3),
      (p_tenant, 'train_class', 'third_class',     'Third Class',     4),
      (p_tenant, 'train_class', 'business_class',  'Business Class',  5)
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

-- Every existing tenant gets the five classes (gaps only — an agency that
-- somehow already has train_class entries keeps them).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM tenants LOOP
    PERFORM seed_tenant_vocabulary(r.id, 'train_class');
  END LOOP;
END $$;

-- Existing rows stored the label ("First Class", "Second Class AC"). Re-file
-- them under the slug the app now stores, the same transform as
-- slugifyKey in lib/vocabulary.ts: lowercase, runs of non-alphanumerics → one
-- underscore, trimmed. Rows already holding a key (108's seed wrote
-- 'first_class') are untouched. A word outside the preset becomes its own
-- slug and stays selectable on the rate as a legacy value.
UPDATE train_rates
SET class_type = btrim(regexp_replace(lower(btrim(class_type)), '[^a-z0-9]+', '_', 'g'), '_')
WHERE class_type IS NOT NULL
  AND class_type ~ '[^a-z0-9_]';

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT count(*) FROM tenant_vocabularies WHERE kind = 'train_class';
--   -- 5 × tenant count
--   SELECT count(*) FROM train_rates WHERE class_type ~ '[^a-z0-9_]';  -- 0
--   SELECT class_type, count(*) FROM train_rates GROUP BY 1 ORDER BY 2 DESC;
