-- ============================================================================
-- 353 — preferred rate rows + the itinerary's pin on the rate it was priced from
-- ============================================================================
-- Two facts the pricing engine could not express:
--
-- 1. WHICH standard hotel in Cairo. accommodation_rates had no preference
--    flag, so with several hotels in one city + tier the engine took whichever
--    row Postgres returned first — an arbitrary, undocumented pick. Cruises,
--    meals and guides already carry is_preferred; hotels now do too. The
--    engine's precedence is: the itinerary's pinned row → the single
--    preferred row → the single candidate → otherwise a pricing HOLE naming
--    the candidates (it refuses to guess). Enforcing "one preferred per city
--    and tier" and the toggle in the rates UI ship separately.
--
-- 2. WHICH row the pricing grid priced a service from. itinerary_services
--    stored only the money; the B2B quote built from the itinerary then
--    re-chose a hotel/guide/meal by tier and OVERWROTE the operator's pick.
--    rate_table + rate_id record the exact rate row so any later re-price
--    (single supplement, currency) reads that row and never re-chooses.
-- ============================================================================

ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS is_preferred boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN accommodation_rates.is_preferred IS
  'The engine''s default among several hotels in the same city and tier. One per city+tier is the intent; enforced by the rates UI.';

ALTER TABLE itinerary_services
  ADD COLUMN IF NOT EXISTS rate_table text,
  ADD COLUMN IF NOT EXISTS rate_id uuid;

COMMENT ON COLUMN itinerary_services.rate_table IS
  'Rate table the pricing grid priced this line from (accommodation_rates, nile_cruises, meal_rates, …). With rate_id, the pin the engine honours instead of re-choosing.';
COMMENT ON COLUMN itinerary_services.rate_id IS
  'Id of the rate row in rate_table this line was priced from. NULL = not pinned (custom amount, legacy row).';

CREATE INDEX IF NOT EXISTS itinerary_services_rate_pin_idx
  ON itinerary_services (rate_table, rate_id)
  WHERE rate_id IS NOT NULL;
