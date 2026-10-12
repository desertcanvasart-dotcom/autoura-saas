-- ============================================================================
-- 416 — B2C quotes carry the seasonal premium as their own line
-- ============================================================================
--
-- Settings → Seasonal Premiums added a percentage to the selling price of a
-- departure in a peak window — but only in the B2B Calculator. B2C quotes
-- (from the Quote Builder, from an itinerary, or edited) were priced as
-- ordinary dates. They now apply it, and record what was applied so the
-- quote, its PDF and its edits show it as a line of its own:
--
--   season_name     the window's season (e.g. "New Year"), null when none
--   season_percent  the premium, % of the price after margin (0 when none)
--   season_premium  the amount inside selling_price
--
-- selling_price keeps meaning the price the client pays (premium included).
-- Existing quotes are unchanged (0 / null). Idempotent.
-- ============================================================================

BEGIN;

ALTER TABLE public.b2c_quotes ADD COLUMN IF NOT EXISTS season_name TEXT;
ALTER TABLE public.b2c_quotes ADD COLUMN IF NOT EXISTS season_percent NUMERIC(6,2) NOT NULL DEFAULT 0;
ALTER TABLE public.b2c_quotes ADD COLUMN IF NOT EXISTS season_premium NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMIT;
