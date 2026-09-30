-- ============================================================================
-- 393 — Airport and hotel assistance: priced per group, per person or per unit
-- ============================================================================
-- An airport or hotel assistance rate had only a price, and every pricing path
-- charged it ONCE for the whole group — an Aswan meet-and-assist cost the same
-- for 2 travellers as for 20. Activities already say how their price applies
-- (activity_rates.pricing_type, migration 351); these two now do too, with the
-- same keys and the same rule (lib/pricing/pricing-basis.ts):
--
--   flat        once for the group (the default — every existing rate keeps
--               pricing exactly as it did);
--   per_person  the rate × the number of travellers;
--   per_unit    the rate × the units the group needs, max_capacity people
--               per unit (e.g. per room of 2).
--
-- Additive and replay-safe.

BEGIN;

ALTER TABLE public.airport_staff_rates
  ADD COLUMN IF NOT EXISTS pricing_type text NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS max_capacity integer;

ALTER TABLE public.hotel_staff_rates
  ADD COLUMN IF NOT EXISTS pricing_type text NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS max_capacity integer;

ALTER TABLE public.airport_staff_rates DROP CONSTRAINT IF EXISTS airport_staff_rates_pricing_type_check;
ALTER TABLE public.airport_staff_rates ADD CONSTRAINT airport_staff_rates_pricing_type_check
  CHECK (pricing_type IN ('flat', 'per_person', 'per_unit'));
ALTER TABLE public.airport_staff_rates DROP CONSTRAINT IF EXISTS airport_staff_rates_max_capacity_check;
ALTER TABLE public.airport_staff_rates ADD CONSTRAINT airport_staff_rates_max_capacity_check
  CHECK (max_capacity IS NULL OR max_capacity > 0);

ALTER TABLE public.hotel_staff_rates DROP CONSTRAINT IF EXISTS hotel_staff_rates_pricing_type_check;
ALTER TABLE public.hotel_staff_rates ADD CONSTRAINT hotel_staff_rates_pricing_type_check
  CHECK (pricing_type IN ('flat', 'per_person', 'per_unit'));
ALTER TABLE public.hotel_staff_rates DROP CONSTRAINT IF EXISTS hotel_staff_rates_max_capacity_check;
ALTER TABLE public.hotel_staff_rates ADD CONSTRAINT hotel_staff_rates_max_capacity_check
  CHECK (max_capacity IS NULL OR max_capacity > 0);

COMMIT;
