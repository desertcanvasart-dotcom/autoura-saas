-- ============================================================================
-- 352 — clients are Leads until their first booking makes them Customers
-- ============================================================================
-- clients.status allowed active / inactive / blocked / prospect / lead, and
-- nothing ever moved a person forward: a prospect stayed a prospect after
-- they booked unless someone edited the record. Two words also meant the
-- same stage (prospect, lead), and the UI offered a third the CHECK refused
-- (blacklisted).
--
-- Now: 'lead' (asked, nothing booked), 'active' (has booked — shown as
-- "Customer"), 'inactive', 'blocked'. Every 'prospect' becomes 'lead'. A
-- trigger promotes a lead to active the moment a booking is inserted for
-- them, on every path that creates bookings — quote conversion, itinerary
-- conversion, imports — with no code in the loop. It never demotes.
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

UPDATE clients SET status = 'lead' WHERE status = 'prospect';

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE clients ADD CONSTRAINT clients_status_check
  CHECK (status IN ('lead', 'active', 'inactive', 'blocked'));
ALTER TABLE clients ALTER COLUMN status SET DEFAULT 'lead';

CREATE OR REPLACE FUNCTION promote_client_on_booking()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.client_id IS NOT NULL THEN
    UPDATE clients
       SET status = 'active', updated_at = now()
     WHERE id = NEW.client_id
       AND status = 'lead';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_promote_client_on_booking ON bookings;
CREATE TRIGGER trg_promote_client_on_booking
  AFTER INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION promote_client_on_booking();

-- Backfill: anyone who already has a booking is a customer.
UPDATE clients c
   SET status = 'active', updated_at = now()
 WHERE c.status = 'lead'
   AND EXISTS (SELECT 1 FROM bookings b WHERE b.client_id = c.id);

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT status, count(*) FROM clients GROUP BY 1;             -- no 'prospect'
--   SELECT count(*) FROM clients c WHERE c.status = 'lead'
--     AND EXISTS (SELECT 1 FROM bookings b WHERE b.client_id = c.id);  -- 0
