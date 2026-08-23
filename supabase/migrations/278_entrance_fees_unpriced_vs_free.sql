-- ============================================================================
-- 278 — entrance_fees: let the schema say "not priced yet"
-- ============================================================================
--
-- Check 8 of the silent-failure audit: "an empty rate means 'not set yet', not
-- 'free'". Here the schema could not express the difference at all.
--
--   eur_rate      NOT NULL DEFAULT 0
--   non_eur_rate  NULL     DEFAULT 0
--
-- Every attraction is therefore born at 0, and 0 means free. An operator who
-- adds "Valley of the Kings" and saves before entering a price gets a row that
-- reads, to every consumer, as a free attraction.
--
-- Both failure directions are live today:
--
--   The engine (auto-pricing-service + its caller) requires `fee.rate > 0` and
--   records an `entrance` hole otherwise. Correct for unpriced rows — but it
--   also flags GENUINELY FREE attractions as missing rates, telling the
--   operator to "Add it in Rates → Attractions" for something already right.
--
--   The two B2B routes reimplement the lookup and have no such guard, so a 0
--   becomes a real EUR 0 line with rateSource 'entrance_fees' and a note
--   reading "EUR 0/pax". That is the defect check 8 describes, and it is why
--   lib/pricing/rate-resolution.ts says routes must never reimplement lookups.
--
-- After this migration:
--   NULL = not priced yet  → lookup returns null → the engine records a hole
--   0    = genuinely free  → priced as a real EUR 0 line
--
-- The three existing zero rows were reviewed with the operator:
--   Khan el-Khalili    bazaar, no entry ticket   → deliberately free, stays 0
--   Colossi of Memnon  roadside monument          → deliberately free, stays 0
--   Sphinx Area        NOT priced yet             → set to NULL below
-- ============================================================================

BEGIN;

ALTER TABLE entrance_fees ALTER COLUMN eur_rate     DROP NOT NULL;
ALTER TABLE entrance_fees ALTER COLUMN eur_rate     DROP DEFAULT;
ALTER TABLE entrance_fees ALTER COLUMN non_eur_rate DROP DEFAULT;

-- Confirmed unpriced by the operator on 2026-08-23. Left at 0 it silently
-- discounts every Giza day that includes it.
UPDATE entrance_fees
   SET eur_rate = NULL, non_eur_rate = NULL
 WHERE attraction_name ILIKE '%sphinx%'
   AND COALESCE(eur_rate, 0) = 0
   AND COALESCE(non_eur_rate, 0) = 0;

-- --------------------------------------------------------------------------
-- Post-check: assert the distinction is now representable AND was applied.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  n_free INT;
  n_unpriced INT;
BEGIN
  IF (SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'entrance_fees' AND column_name = 'eur_rate') <> 'YES' THEN
    RAISE EXCEPTION 'eur_rate is still NOT NULL — unpriced cannot be represented';
  END IF;

  IF (SELECT column_default FROM information_schema.columns
      WHERE table_name = 'entrance_fees' AND column_name = 'eur_rate') IS NOT NULL THEN
    RAISE EXCEPTION 'eur_rate still has a default — new rows would be born "free"';
  END IF;

  SELECT count(*) FILTER (WHERE eur_rate = 0),
         count(*) FILTER (WHERE eur_rate IS NULL)
    INTO n_free, n_unpriced
    FROM entrance_fees;

  IF n_unpriced < 1 THEN
    RAISE EXCEPTION 'expected Sphinx Area to be marked unpriced, found none';
  END IF;

  RAISE NOTICE 'entrance_fees: % deliberately free, % unpriced', n_free, n_unpriced;
END $$;

COMMIT;
