-- ============================================================================
-- 299 — widen the currency set for the MEA market (C3.4c)
-- ============================================================================
--
-- The EUR/USD/GBP/EGP set was inherited from the reference implementation's
-- Egyptian-agency reality. An MEA-first product needs the currencies of its
-- seeded destinations and the Gulf currencies clients pay in. This redefines
-- every rate_currency CHECK (migration 295), the tenants.rates_currency
-- CHECK (migration 298), and nothing else — same columns, wider vocabulary.
--
-- Must match SUPPORTED_CURRENCIES in lib/currency.ts. Widening again later
-- is: extend that list + a migration like this one.

BEGIN;

DO $$
DECLARE
  t TEXT;
  allowed TEXT := $list$('EUR', 'USD', 'GBP', 'EGP', 'AED', 'SAR', 'JOD', 'MAD', 'TND', 'KES', 'TZS', 'ZAR')$list$;
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
    -- Guard for from-scratch replay symmetry with 295: only touch tables
    -- that exist and already carry the column.
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_rate_currency_check');
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK (rate_currency IS NULL OR rate_currency IN %s)',
      t, t || '_rate_currency_check', allowed
    );
  END LOOP;

  ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_rates_currency_check;
  EXECUTE format(
    'ALTER TABLE tenants ADD CONSTRAINT tenants_rates_currency_check CHECK (rates_currency IS NULL OR rates_currency IN %s)',
    allowed
  );
END $$;

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   INSERT-probe a rate row with rate_currency='JOD'  -- accepted
--   ... with rate_currency='XXX'                       -- CHECK violation
