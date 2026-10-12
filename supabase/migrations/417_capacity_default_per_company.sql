-- ============================================================================
-- 417 — the Capacity Calendar's default groups per day, saved per company
-- ============================================================================
--
-- Settings → Capacity offered a "Default Max Groups per Day" field that was
-- never saved, and nothing checked capacity when a booking was made. The
-- default is now the company's own:
--
--   tenants.default_max_groups_per_day — the limit for a day with no entry of
--   its own on the calendar; NULL = no limit (every existing company, so
--   nothing changes until the default is set).
--
-- Bookings (from a quote, or by confirming an itinerary) are checked against
-- the day's limit or this default (lib/capacity/booking-capacity.ts).
-- Idempotent.
-- ============================================================================

BEGIN;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS default_max_groups_per_day INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.tenants'::regclass
       AND conname = 'tenants_default_max_groups_per_day_check'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_default_max_groups_per_day_check
      CHECK (default_max_groups_per_day IS NULL OR default_max_groups_per_day BETWEEN 0 AND 1000);
  END IF;
END $$;

COMMIT;
