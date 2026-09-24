-- ============================================================================
-- 385 — A service's day is ONE fact, whichever of its two columns is written
-- ============================================================================
-- Operator, 2026-09-24: an itinerary priced in the Pricing Grid "doesn't
-- carry the price or P&L".
--
-- itinerary_services has two columns naming the day, both FKs to
-- itinerary_days: day_id (foundation) and itinerary_day_id (migration 132,
-- "the code uses this instead"). The code never settled on one. The grid, the
-- day-services API, generate-tasks and the B2B template write/read day_id;
-- the itinerary editor, the /days API that feeds the P&L, the share page,
-- the email route and the B2B quote builder read itinerary_day_id. On
-- 2026-09-24 every one of the 32 live service rows had ONLY day_id — so the
-- grid's services were invisible on the itinerary, and the editor, seeing
-- none, saved the itinerary's total as 0 (live ITN-S-2026-6386).
--
-- Rather than chase every reader, the database keeps the two in step: a
-- write to either sets the other. A row naming two DIFFERENT days is refused
-- — never guess which one was meant.
--
-- Also: client_price defaulted to 0. The client total reads an explicit
-- client_price as "sold at this price", so a row that merely took the
-- default read as "sold for free" and the trip totalled 0. No default now —
-- an unset client_price means cost × the itinerary's margin. Existing grid
-- rows (the only writer relying on the default) are cleared of the
-- accidental 0.

CREATE OR REPLACE FUNCTION public.sync_itinerary_service_day()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- One column changed: carry it to the other.
    IF NEW.day_id IS DISTINCT FROM OLD.day_id
       AND NEW.itinerary_day_id IS NOT DISTINCT FROM OLD.itinerary_day_id THEN
      NEW.itinerary_day_id := NEW.day_id;
    ELSIF NEW.itinerary_day_id IS DISTINCT FROM OLD.itinerary_day_id
       AND NEW.day_id IS NOT DISTINCT FROM OLD.day_id THEN
      NEW.day_id := NEW.itinerary_day_id;
    END IF;
  END IF;

  NEW.itinerary_day_id := COALESCE(NEW.itinerary_day_id, NEW.day_id);
  NEW.day_id := COALESCE(NEW.day_id, NEW.itinerary_day_id);

  IF NEW.day_id IS DISTINCT FROM NEW.itinerary_day_id THEN
    RAISE EXCEPTION 'itinerary_services: day_id (%) and itinerary_day_id (%) name different days',
      NEW.day_id, NEW.itinerary_day_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_itinerary_service_day ON public.itinerary_services;
CREATE TRIGGER trg_sync_itinerary_service_day
  BEFORE INSERT OR UPDATE OF day_id, itinerary_day_id ON public.itinerary_services
  FOR EACH ROW EXECUTE FUNCTION public.sync_itinerary_service_day();

-- Backfill: every row names its day in both columns.
UPDATE public.itinerary_services
   SET itinerary_day_id = day_id
 WHERE itinerary_day_id IS NULL AND day_id IS NOT NULL;

UPDATE public.itinerary_services
   SET day_id = itinerary_day_id
 WHERE day_id IS NULL AND itinerary_day_id IS NOT NULL;

-- client_price: no default; clear the accidental 0 on grid-written rows.
ALTER TABLE public.itinerary_services ALTER COLUMN client_price DROP DEFAULT;

UPDATE public.itinerary_services
   SET client_price = NULL
 WHERE client_price = 0
   AND description LIKE '[pricing-grid:%';
