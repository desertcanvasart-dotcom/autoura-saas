-- ============================================================================
-- 295 — rate_currency: record each rate in its contract currency
-- ============================================================================
--
-- P3 of docs/plans/productization-from-reference.md (accounting model proven
-- in the reference implementation): a supplier contract priced in EGP stays
-- EGP in the database forever. The pricing engine converts a COPY at the
-- fetch boundary using the live exchange_rates table; nothing ever rewrites
-- the stored amount.
--
-- Semantics:
--   rate_currency NULL  = the system default (EUR — every monetary column on
--                         these tables is EUR-denominated today), i.e. the
--                         pre-migration meaning of every existing row.
--   rate_currency 'XXX' = every monetary column on THAT ROW is in XXX.
--
-- No backfill, deliberately: NULL keeps meaning "EUR" so applying this
-- migration changes nothing until someone picks a currency on a rate.
-- Allowed set mirrors lib/currency.ts CurrencyCode / SUPPORTED_CURRENCIES;
-- widening it later is a one-line CHECK change plus the exchange-rate feed.

BEGIN;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'guides',
    'guide_rates',
    'entrance_fees',
    'accommodation_rates',
    'transportation_rates',
    'tipping_rates',
    'nile_cruises',
    'meal_rates',
    'hotel_staff_rates',
    'airport_staff_rates',
    'activity_rates',
    'flight_rates',
    'train_rates',
    'sleeping_train_rates',
    'fixed_daily_costs',
    'b2b_transport_packages'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS rate_currency TEXT', t
    );
    EXECUTE format(
      'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_rate_currency_check'
    );
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK (rate_currency IS NULL OR rate_currency IN (''EUR'', ''USD'', ''GBP'', ''EGP''))',
      t, t || '_rate_currency_check'
    );
  END LOOP;
END $$;

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check (run after COMMIT):
--   1. All 16 tables carry the column:
--      SELECT count(*) FROM information_schema.columns
--      WHERE column_name = 'rate_currency';               -- expect >= 16
--   2. The CHECK holds (service role):
--      UPDATE guides SET rate_currency = 'XXX' WHERE false; -- ok (no rows)
--      INSERT a probe row with rate_currency='XXX'          -- expect CHECK violation
--   3. Existing rows untouched:
--      SELECT count(*) FROM guides WHERE rate_currency IS NOT NULL; -- expect 0
