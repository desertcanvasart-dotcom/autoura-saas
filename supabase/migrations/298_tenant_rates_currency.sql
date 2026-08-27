-- ============================================================================
-- 298 — tenants.rates_currency: the tenant's run currency for pricing
-- ============================================================================
--
-- C3.4 of docs/plans/parity-campaign.md. Every monetary rate column in this
-- schema is named *_eur, but the NAME is historical — what the engine
-- actually needs is "the one currency all stored rates are denominated in
-- and pricing runs in". This makes that a per-tenant setting instead of a
-- hard-coded EUR: a Jordanian agency keeps its book in USD, an Egyptian one
-- in EGP, and the column names stop being a lie one tenant at a time.
--
--   NULL  = EUR (the historical assumption; every existing tenant unchanged)
--   'XXX' = all this tenant's rate amounts are in XXX; per-rate
--           rate_currency (migration 295) still overrides row by row, and
--           the fetch-boundary normalizer converts into THIS currency.
--
-- No backfill. Changing the setting on a tenant with existing rates does NOT
-- convert anything — it reinterprets the stored numbers, which is exactly
-- the reference implementation's cut-over model (an explicit, audited bulk
-- restatement is a separate operation if ever needed).

BEGIN;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS rates_currency TEXT;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_rates_currency_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_rates_currency_check
  CHECK (rates_currency IS NULL OR rates_currency IN ('EUR', 'USD', 'GBP', 'EGP'));

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT count(*) FROM information_schema.columns
--   WHERE table_name = 'tenants' AND column_name = 'rates_currency';  -- 1
--   SELECT count(*) FROM tenants WHERE rates_currency IS NOT NULL;    -- 0
