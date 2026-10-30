-- ============================================
-- 451: a line with no supplier never borrows the service name as one
-- ============================================
-- The 2026-10-30 click-through: lines built from the itinerary (446) put the
-- service name ("day_tour sedan Cairo") in supplier_name when no supplier was
-- known, leaving service_description empty — so requests greeted
-- "Hello day_tour". The builder now leaves the supplier empty and keeps the
-- service in the description (lib/bookings/booking-suppliers). This repairs
-- the rows already written that way: built from an itinerary service, no
-- supplier, no description. Production had 4.

BEGIN;

UPDATE public.booking_supplier_status
   SET service_description = supplier_name,
       supplier_name = '',
       updated_at = NOW()
 WHERE itinerary_service_id IS NOT NULL
   AND supplier_id IS NULL
   AND resource_kind <> 'own'          -- an own car or guide's name is theirs
   AND service_description IS NULL
   AND COALESCE(TRIM(supplier_name), '') <> '';

COMMIT;
