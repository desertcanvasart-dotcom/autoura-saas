-- ============================================================================
-- 382 — A sailing has a fixed departure day, and the system should know it
-- ============================================================================
-- Operator, 2026-09-22 (already live in the sibling): "most of my cruises have
-- a fixed starting day — add it to the form so people have more data about the
-- cruise, and if it gets chosen for an itinerary that doesn't match the day it
-- will alarm the user."
--
-- A Nile ship leaves Aswan on set weekdays. Nothing in the system knew that, so
-- a Wednesday itinerary could be quoted on a Monday-and-Friday sailing: the
-- price was right, the arithmetic was right, and the booking was impossible.
--
-- EMPTY MEANS NO FIXED DAY, and is the default. Most rows will never carry one,
-- and a rate that has never said otherwise must not start failing — so the
-- check this feeds (a warning, never a price change) is silent until the
-- operator actually enters days.
--
-- Stored as weekday KEYS ('mon'…'sun'), not numbers: a number is a different
-- day depending on whether the reader starts the week on Sunday, and this data
-- travels between installs. See lib/rates/cruise-sailing.ts.

ALTER TABLE public.nile_cruises
  ADD COLUMN IF NOT EXISTS sailing_days TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.nile_cruises.sailing_days IS
  'Weekday keys the sailing departs on (mon,tue,wed,thu,fri,sat,sun). EMPTY = no fixed day, the default, which silences the itinerary check. See lib/rates/cruise-sailing.ts.';

ALTER TABLE public.nile_cruises
  DROP CONSTRAINT IF EXISTS nile_cruises_sailing_days_keys;

-- A shape, not a policy: the operator decides WHICH days, this only says they
-- are spelled the one way.
ALTER TABLE public.nile_cruises
  ADD CONSTRAINT nile_cruises_sailing_days_keys
  CHECK (sailing_days <@ ARRAY['mon','tue','wed','thu','fri','sat','sun']::text[]);
