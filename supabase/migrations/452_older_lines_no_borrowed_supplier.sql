-- ============================================
-- 452: older lines that borrowed a service name as their supplier
-- ============================================
-- 451 repaired lines built from an itinerary service (446+). Lines written
-- before 446 have no itinerary_service_id, and some carry a service name
-- ("airport_transfer sedan Cairo", "full_service CAI") in supplier_name with
-- no supplier record — shown as the supplier, and greeted as one. Production
-- had 59 on 4 bookings (2026-10-30).
--
-- Repaired only when certain: no supplier record, no description, not an own
-- car/guide, not a hotel or cruise (there the service name IS the property),
-- and the name is EXACTLY a service on that booking's trip. The name moves to
-- the description; the supplier is left empty for the office to choose.

BEGIN;

UPDATE public.booking_supplier_status s
   SET service_description = s.supplier_name,
       supplier_name = '',
       updated_at = NOW()
  FROM public.bookings b
 WHERE b.id = s.booking_id
   AND s.itinerary_service_id IS NULL
   AND s.supplier_id IS NULL
   AND s.service_description IS NULL
   AND s.resource_kind <> 'own'
   AND s.supplier_type NOT IN ('hotel', 'cruise')
   AND COALESCE(TRIM(s.supplier_name), '') <> ''
   AND EXISTS (
     SELECT 1
       FROM public.itinerary_services i
       JOIN public.itinerary_days d ON d.id = COALESCE(i.itinerary_day_id, i.day_id)
      WHERE d.itinerary_id = b.itinerary_id
        AND TRIM(i.service_name) = TRIM(s.supplier_name)
   );

COMMIT;
