-- ============================================
-- 378: a cruise's length is what was entered — not a default of four nights
-- ============================================
-- nile_cruises.duration_nights (migration 106) is a JSON list of the lengths a
-- ship sails, with
--
--     DEFAULT '[4]'::jsonb
--
-- so a cruise saved without a length — a bulk import with the column blank, an
-- API write that leaves it out — silently became a four-night cruise. The
-- length is what turns a price entered PER TRIP into a price per night, so an
-- invented length is an invented price. The code-side guesses (`|| 4` in the
-- engine, the rate readers, the import and the save route) go in the same
-- change; this removes the last one, in the database itself.
--
-- On production today (2026-09-22): 132 cruises, every one of them 4 nights —
-- 88 stored as [4], 44 as 4 — and every one priced per night, so nothing is
-- priced from its length. Which of those fours were typed and which were this
-- default cannot be told from the data, so NO ROW IS CHANGED: this only stops
-- new rows being given a length nobody entered.
--
-- CHANGES PRODUCTION (a column default; no data). No ordering constraint with
-- the code: the create route now writes the lengths it is sent, or NULL,
-- explicitly. Idempotent.
ALTER TABLE IF EXISTS public.nile_cruises ALTER COLUMN duration_nights DROP DEFAULT;

NOTIFY pgrst, 'reload schema';
