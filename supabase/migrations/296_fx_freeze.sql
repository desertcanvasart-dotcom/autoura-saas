-- ============================================================================
-- 296 — fx_frozen: the exchange-rate snapshot an itinerary was confirmed at
-- ============================================================================
--
-- P4 of docs/plans/productization-from-reference.md. Rates in exchange_rates
-- refresh daily; a confirmed itinerary's economics must not drift with them.
-- At the FIRST transition to status='confirmed' the app stamps fx_frozen with
-- the active exchange-rate snapshot (base EUR). After that, supplier costs
-- move only through the explicit, logged reprice endpoint
-- (POST /api/itineraries/[id]/reprice-fx) — which restates lines carrying
-- supplier_cost_original in their contract currency and re-stamps the
-- snapshot with source='reprice'. The client price NEVER moves.
--
-- Shape: { base: 'EUR', rates: [{base_currency,target_currency,rate,is_active}],
--          frozen_at, frozen_by, source: 'confirm'|'reprice' }
--
-- NULL = never confirmed under this model (or confirmed before the feature
-- existed) — the app treats absence as "nothing frozen" and never guesses.

BEGIN;

ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS fx_frozen JSONB;

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check (run after COMMIT):
--   SELECT count(*) FROM information_schema.columns
--   WHERE table_name = 'itineraries' AND column_name = 'fx_frozen';  -- expect 1
--   SELECT count(*) FROM itineraries WHERE fx_frozen IS NOT NULL;    -- expect 0
