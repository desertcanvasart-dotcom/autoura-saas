-- =====================================================================
-- 271 — EMERGENCY: un-break b2b_quotes → itineraries embeds
-- =====================================================================
-- 270 added converted_to_itinerary_id with an FK to itineraries, giving
-- b2b_quotes TWO relationships to that table. PostgREST refuses the
-- plain `itineraries(...)` embed as ambiguous ("more than one
-- relationship was found"), which broke every /quotes/b2b list/detail/
-- PDF/send query the moment 270 was applied. The shared [type] quote
-- routes use one embed string for both b2c and b2b, so a per-table FK
-- hint is not a clean fix.
--
-- Drop the FK and keep the column: it is a nullable audit pointer, not
-- a join path — nothing embeds through it, and losing ON DELETE SET
-- NULL on an audit field is an acceptable trade for unambiguous embeds.
-- =====================================================================

ALTER TABLE b2b_quotes
  DROP CONSTRAINT IF EXISTS b2b_quotes_converted_to_itinerary_id_fkey;
