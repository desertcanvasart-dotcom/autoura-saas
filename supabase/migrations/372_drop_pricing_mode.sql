-- ============================================
-- 372: tour_templates.pricing_mode goes
-- ============================================
-- The twin of uses_day_builder (371). The tours page used to price a tour only
-- when `uses_day_builder || pricing_mode === 'auto'`; #484 removed that gate —
-- a tour is priced from its days — and nothing has read this column since.
--
-- Checked on production before writing this, 2026-09-21: it is NULL on all 47
-- tours, in every agency. The Tour Manager kept 'auto' in its form state and
-- the templates API never saved it. Nothing depends on the column — no
-- default, no constraint, no index, no view, no function, no policy, no
-- trigger. It is the only `pricing_mode` column in the database
-- (`pricing_model`, on B2B partners, is a different and live column).
--
-- ORDER, as for 371: apply AFTER the code that stopped selecting the column is
-- deployed. /api/b2b/calculate-price named it in an embedded select, and
-- PostgREST fails the whole query on a column that does not exist.
--
-- Idempotent.
ALTER TABLE public.tour_templates DROP COLUMN IF EXISTS pricing_mode;

NOTIFY pgrst, 'reload schema';
