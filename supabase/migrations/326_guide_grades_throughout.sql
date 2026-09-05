-- =====================================================================
-- 326 — guide grades + the throughout guide ("+1") — schema (B-item 1)
-- =====================================================================
-- Business model (operator's decisions, ported from the sibling):
-- two guide GRADES — 'egyptologist' (the default) and 'senior' — and two
-- guide MODES: 'spot' (historical: a per-city guide on sightseeing days
-- only) and 'throughout' ("+1": ONE guide travels day 1 → end, with a fee
-- every day, a bed each night at the property's guide rate, meals at group
-- rates when the party is small, one extra vehicle seat, and a ticket on
-- trains/flights).
--
-- guide_rates.guide_type is the grade axis and tour_duration the fee kind
-- (full_day / half_day / meet_greet) — both are already TEXT, so the
-- vocabulary is a UI/engine decision, not a constraint change. What the
-- schema needs:

-- 1. The quote remembers what was asked. NULL = the defaults
--    (egyptologist / spot), so existing rows need no backfill — the same
--    convention as every nullable preference here.
ALTER TABLE b2b_quotes
  ADD COLUMN IF NOT EXISTS guide_grade TEXT
    CHECK (guide_grade IS NULL OR guide_grade IN ('egyptologist', 'senior')),
  ADD COLUMN IF NOT EXISTS guide_mode TEXT
    CHECK (guide_mode IS NULL OR guide_mode IN ('spot', 'throughout'));

COMMENT ON COLUMN b2b_quotes.guide_grade IS
  'Guide grade asked for on this quote. NULL = egyptologist (the default). '
  'Store only non-default values.';
COMMENT ON COLUMN b2b_quotes.guide_mode IS
  'spot = per-city guide on sightseeing days (historical); throughout = one '
  'guide travels the whole trip (+1 seat/bed/meals). NULL = spot.';

-- 2. A ticket may carry a negotiated guide fare. Semantics differ from
--    beds: a ticket always HAS a public price, so NULL = the guide pays
--    the customer fare and 0 = the guide rides free. (Beds are the other
--    way round: a concession either exists or it does not — the per-night
--    guide bed lives in the rate PERIODS (seasons JSONB, RATE_FIELDS), not
--    here, and a blank one is a pricing hole.)
ALTER TABLE train_rates ADD COLUMN IF NOT EXISTS guide_rate NUMERIC;
ALTER TABLE sleeping_train_rates ADD COLUMN IF NOT EXISTS guide_rate NUMERIC;
ALTER TABLE flight_rates ADD COLUMN IF NOT EXISTS guide_rate NUMERIC;

COMMENT ON COLUMN train_rates.guide_rate IS
  'Negotiated fare for the throughout guide''s seat. NULL = guide pays the '
  'customer fare; 0 = rides free. Converts with the row (rate_currency).';
COMMENT ON COLUMN sleeping_train_rates.guide_rate IS
  'Negotiated fare for the throughout guide''s berth. NULL = customer fare; '
  '0 = rides free. Converts with the row (rate_currency).';
COMMENT ON COLUMN flight_rates.guide_rate IS
  'Negotiated fare for the throughout guide''s seat. NULL = customer fare; '
  '0 = rides free. Converts with the row (rate_currency).';

-- =====================================================================
-- Verify after applying:
--   Calculate a quote with guide_mode='throughout' — a Throughout Guide
--   fee line appears for every day, and nights whose hotel period has no
--   guide_rate come back as named holes, never free beds.
-- =====================================================================
