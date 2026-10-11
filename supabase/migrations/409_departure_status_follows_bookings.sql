-- ============================================================================
-- 409 — a departure's status follows its bookings both ways
-- ============================================================================
-- update_departure_status (migration 128) set a departure Full when it sold
-- out — and never set it back when bookings dropped: a cancellation left it
-- Full with seats free, and the page hid the status menu on Full ones, so it
-- stayed Full until deleted (which bookings block). It also overrode a
-- Cancelled departure with Full.
--
-- Now, when booked_pax changes:
--   Draft and Cancelled are the operator's — never changed here.
--   At capacity                → Full
--   80% or more                → Limited
--   guaranteed, minimum reached → Guaranteed
--   below those, was Full or Limited → Open again
-- An Open or Guaranteed departure the rules do not move stays as it is.
--
-- Idempotent: safe to re-run.

BEGIN;

CREATE OR REPLACE FUNCTION update_departure_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('draft', 'cancelled') THEN
    RETURN NEW;
  END IF;

  IF NEW.max_pax > 0 AND NEW.booked_pax >= NEW.max_pax THEN
    NEW.status := 'full';
  ELSIF NEW.max_pax > 0 AND NEW.booked_pax >= (NEW.max_pax * 0.8) THEN
    NEW.status := 'limited';
  ELSIF NEW.is_guaranteed AND NEW.booked_pax >= NEW.min_pax THEN
    NEW.status := 'guaranteed';
  ELSIF NEW.status IN ('full', 'limited') THEN
    NEW.status := 'open';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
