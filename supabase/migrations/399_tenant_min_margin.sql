-- ============================================================================
-- 399 — the agency's minimum margin
-- ============================================================================
--
-- The itinerary page warns when a trip's margin falls below what the agency
-- will accept ("Needs attention"). The minimum is the agency's to choose, in
-- the same measure as its house margin (279): a markup on cost.
--
-- NULLABLE, and deliberately NO DEFAULT (as 279):
--   NULL = no minimum set -> no below-minimum warning (a loss is still said)
--   n    = warn below n% on cost
-- ============================================================================

BEGIN;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS min_margin_percent NUMERIC(5,2);

COMMENT ON COLUMN tenants.min_margin_percent IS
  'Warn on an itinerary whose margin (markup on cost) is below this. NULL = no '
  'minimum set. Same measure as default_margin_percent.';

DO $$
DECLARE
  col RECORD;
BEGIN
  SELECT is_nullable, column_default INTO col
  FROM information_schema.columns
  WHERE table_name = 'tenants' AND column_name = 'min_margin_percent';

  IF col IS NULL THEN
    RAISE EXCEPTION 'tenants.min_margin_percent was not created';
  END IF;
  IF col.is_nullable <> 'YES' OR col.column_default IS NOT NULL THEN
    RAISE EXCEPTION 'tenants.min_margin_percent must be nullable with no default — NULL means "not set"';
  END IF;
END $$;

COMMIT;
