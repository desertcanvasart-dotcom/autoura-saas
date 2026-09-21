-- ============================================
-- 376: the last two columns with no migration behind them go
-- ============================================
-- Migration 374 adopted 21 columns production had and no migration built. It
-- left two out on purpose, because adopting them would have given a mistake a
-- history. Nothing in this app reads or writes either one — not the code, not
-- a CSV sheet, not a function, view, policy or trigger.
--
--   itineraries.cabin_allocation  (jsonb)
--     The SIBLING product's column: travel-ops-pro's
--     20260205_cruise_pricing_overhaul.sql, run against this database by hand
--     — the column comment on production is that migration's, word for word.
--     Same story as bookings.status_override (373). The sibling's itinerary
--     editor uses it; this app prices cruise cabins another way and has never
--     had the field. If that feature is ever ported it arrives with its own
--     migration, in this repo.
--
--   content_library.content_type  (varchar(50))
--     Origin unknown: no migration here, none in the sibling, no comment. Its
--     neighbours (is_cruise, route, tour_type…) were hand-made too, but the
--     code uses those, so 374 adopted them. Nothing uses this one.
--
-- Checked on production 2026-09-21: content_library has 0 rows; itineraries
-- has 3, all NULL here. Nothing depends on either column — no default,
-- constraint, index, view, function, policy or trigger.
--
-- A drop cannot be taken back, so it does not trust that check to still be
-- true: if either column holds a value when this runs, it REFUSES and drops
-- nothing.
--
-- No ordering constraint (no code names them). Idempotent.

DO $$
DECLARE
  item TEXT[];
  held BIGINT;
BEGIN
  FOREACH item SLICE 1 IN ARRAY ARRAY[
    ['itineraries',     'cabin_allocation'],
    ['content_library', 'content_type']
  ] LOOP
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = item[1] AND column_name = item[2]
    );
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I IS NOT NULL', item[1], item[2]) INTO held;
    IF held > 0 THEN
      RAISE EXCEPTION '376: %.% holds % value(s) — it was empty when this was written. Refusing to drop it; look at what wrote them first.',
        item[1], item[2], held;
    END IF;
  END LOOP;
END $$;

ALTER TABLE IF EXISTS public.itineraries     DROP COLUMN IF EXISTS cabin_allocation;
ALTER TABLE IF EXISTS public.content_library DROP COLUMN IF EXISTS content_type;

NOTIFY pgrst, 'reload schema';
