-- ============================================================================
-- 305 — dated rate periods for hotels and cruises (C3.2)
-- ============================================================================
--
-- Both catalogs carry three hardcoded price levels (low/high/peak) and four
-- date windows. Real contracts do not work that way: the number of dated
-- periods depends on the property, and six is ordinary.
--
-- `seasons` is an ordered JSONB array on the rate row — each entry a real
-- dated window carrying its own complete rate set, the same shape the
-- activity tiers use. NULL means "no periods entered", and the row keeps
-- pricing from its legacy columns exactly as before.
--
-- WHY THIS MATTERS BEYOND FLEXIBILITY: the resolvers this replaces
-- (detectHotelSeason / detectCruiseSeason) compare MONTH AND DAY ONLY, so a
-- window entered for one contract year silently applies to every year after
-- it. Contracts are re-issued annually with moved dates. Periods carry real
-- dates including the year.
--
-- Shape of one entry:
--   { "name": "Christmas", "from": "2026-12-20", "to": "2027-01-05",
--     "rates": { "ppd_eur": 120, "single_supplement_eur": 40, ... } }

BEGIN;

ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS seasons JSONB;
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS seasons JSONB;

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT count(*) FROM information_schema.columns
--   WHERE column_name = 'seasons'
--     AND table_name IN ('accommodation_rates', 'nile_cruises');   -- expect 2
--   SELECT count(*) FROM accommodation_rates WHERE seasons IS NOT NULL; -- 0
