-- ============================================
-- 371: tour_templates.uses_day_builder goes
-- ============================================
-- The tours page used to ask this flag before pricing a tour AT ALL. It
-- defaults to false and a CSV import left it false, so 26 of 47 live tours —
-- all of Sawa Tours', Sillage's and the Sandbox's — were never sent to the
-- pricing engine, whatever their days said (#484 removed the gate: a tour is
-- priced from its days).
--
-- Since then nothing reads it. It was never even written by the app: the Tour
-- Manager had a tick for it that the templates API ignored, so the only values
-- it ever held came from a spreadsheet column. A column that means nothing but
-- LOOKS like a switch for pricing is a trap for the next person, so it goes.
--
-- Checked on production before writing this, 2026-09-21: nothing depends on
-- the column but its own default — no view, no function, no policy, no index.
--
-- ORDER: this must be applied AFTER the code that stopped selecting the column
-- is deployed. /api/b2b/calculate-price named it in an embedded select, and
-- PostgREST fails the whole query on a column that does not exist.
--
-- Idempotent.
ALTER TABLE public.tour_templates DROP COLUMN IF EXISTS uses_day_builder;

-- PostgREST caches the schema; without this the API keeps offering the column
-- (and the type generator keeps seeing it) until the next restart.
NOTIFY pgrst, 'reload schema';
