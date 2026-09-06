-- ============================================================================
-- 338 — transportation_rates: the row's own passenger band
-- ============================================================================
-- With one row per vehicle (337) the row must say how many people the
-- vehicle seats: the engine picks the smallest vehicle whose band fits the
-- group, the grid re-selects as the group grows. The page and API have been
-- READING capacity_min / capacity_max from this table for months — but the
-- columns never existed (the API guessed capacity_min from the vehicle name
-- and capacity_max was always undefined), and the wide layout carried them
-- per class instead. Now they are real. The legacy single `capacity` column
-- stays untouched.
--
-- Idempotent: safe to re-run.

ALTER TABLE transportation_rates
  ADD COLUMN IF NOT EXISTS capacity_min INTEGER,
  ADD COLUMN IF NOT EXISTS capacity_max INTEGER;

COMMENT ON COLUMN transportation_rates.capacity_min IS 'Smallest group this vehicle is offered to on this route (people).';
COMMENT ON COLUMN transportation_rates.capacity_max IS 'Largest group this vehicle seats on this route (people).';
