-- ============================================================================
-- 344 — a hotel property carries its accommodation type
-- ============================================================================
-- The Accommodation types vocabulary (hotel / resort / camp / dahabiya …,
-- migration 334) was wired into the hotel RATE form only, so "this property
-- is a camp" had to be typed again on every rate row. The supplier's
-- property is the natural home for that fact; the rate form now inherits it
-- when a property is picked.
--
-- Stores the vocabulary KEY (hotel_property_type), like the other vocabulary
-- columns. NULL for ships and trains, and for hotels nobody has classified.
--
-- ADDITIVE — apply BEFORE the deploy that writes it (the 239 rule for adds).
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

ALTER TABLE supplier_properties ADD COLUMN IF NOT EXISTS accommodation_type TEXT;

COMMENT ON COLUMN supplier_properties.accommodation_type IS
  'Hotel properties only: the agency''s accommodation-type vocabulary key '
  '(tenant_vocabularies kind=hotel_property_type). NULL for ships/trains.';

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'supplier_properties' AND column_name = 'accommodation_type';  -- 1 row
--   Then: NOTIFY pgrst, 'reload schema'; and regenerate types/database.types.ts.
