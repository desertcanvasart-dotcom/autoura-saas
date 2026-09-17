-- ============================================================================
-- 362 — A lead becomes a Customer when the booking becomes real, not only when
--       the row is first written
-- ============================================================================
--
-- promote_client_on_booking() (migration 352) is attached AFTER INSERT ONLY:
--
--   CREATE TRIGGER trg_promote_client_on_booking
--     AFTER INSERT ON bookings
--
-- Two ways a lead therefore stays a lead for ever:
--
--   1. A booking whose client is attached LATER. The insert carries
--      client_id = NULL (every B2B booking did — see the app change in this
--      PR), and the UPDATE that fills it in fires nothing.
--   2. A booking that starts life cancelled or is inserted by an import and
--      confirmed afterwards. Only the insert was ever considered.
--
-- And one way a lead is promoted when it should not be: a booking INSERTED
-- with status 'cancelled' promoted the client just the same, because the
-- function never looked at the status.
--
-- The trigger now also fires on UPDATE OF status and UPDATE OF client_id, and
-- the function skips cancelled bookings. It still only ever moves 'lead' →
-- 'active' ("Customer" in the UI, lib/client-stage.ts): it never demotes, and
-- it never touches inactive or blocked. Re-running is harmless.
--
-- Backfill: promote any lead that already has a non-cancelled booking. On this
-- database that is zero rows today (no bookings exist yet) — this is
-- prevention, and the statement is here so it stays right on installs that do.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION promote_client_on_booking()
RETURNS TRIGGER AS $$
BEGIN
  -- A cancelled booking is not custom. Nothing to promote, nothing to undo:
  -- a client promoted by an earlier, live booking stays a Customer.
  IF NEW.status IS NOT DISTINCT FROM 'cancelled' THEN
    RETURN NEW;
  END IF;

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
  AFTER INSERT OR UPDATE OF status, client_id ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION promote_client_on_booking();

-- Catch up anyone the INSERT-only trigger missed.
UPDATE clients c
   SET status = 'active', updated_at = now()
 WHERE c.status = 'lead'
   AND EXISTS (
     SELECT 1 FROM bookings b
      WHERE b.client_id = c.id
        AND b.status IS DISTINCT FROM 'cancelled'
   );

COMMIT;
