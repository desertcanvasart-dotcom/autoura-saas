-- ============================================================================
-- 468 — a preferred Nile cruise per route and length, not per tier
-- ============================================================================
-- Operator, 2026-11-15: starring the 4-night Luxor → Aswan Ceila as preferred
-- unticked the 3-night Aswan → Luxor Ceila. "As long as the number of sailing
-- days, the cruise and the sailing weekday are different, it should save more
-- than one boat on each route."
--
-- A nile_cruises row is one sailing. Two rows compete for the star only when a
-- tour could be priced from either: same tier, same embark and disembark city,
-- overlapping length (duration_nights) — lib/rates/cruise-candidates.ts, one
-- rule for the star toggle, the cruise form, the bulk import and the engine.
-- The weekday does not split the star: one boat per route and length
-- (operator, 2026-11-15), so a website price with no date can still choose.
--
-- Migration 354's index allowed ONE preferred cruise per tenant + tier, and
-- would refuse a second star on another route. Lengths are a list an index
-- cannot compare, so — as for guides and transport — the app keeps
-- the star unique within its scope (it clears the competing rows first), and
-- the index goes. Existing stars are unchanged: one per tier is a subset of
-- one per sailing.
--
-- Idempotent: safe to re-run.

BEGIN;

DROP INDEX IF EXISTS public.nile_cruises_one_preferred_idx;

COMMIT;
