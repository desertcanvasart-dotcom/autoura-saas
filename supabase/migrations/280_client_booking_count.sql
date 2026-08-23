-- ============================================================================
-- 280 — clients.total_bookings_count: a number nothing ever wrote
-- ============================================================================
--
-- Found auditing dashboard figures for an input. The column is created in
-- migration 200, rendered on the client detail page as "Bookings", and used as
-- the "most bookings" sort in components/ClientFilters.tsx — and NOTHING in
-- the codebase writes it. All six client rows read 0.
--
-- The display is merely wrong. The sort is worse: ordering by a column that is
-- 0 for every row looks like it worked and silently returns an arbitrary
-- order, so "sort by most bookings" has never once sorted anything.
--
-- ── Recompute, never increment ──────────────────────────────────────────────
-- The obvious implementation is `count = count + 1` on insert. The sibling
-- codebase did exactly that and it drifted: a production-only trigger
-- incremented on every trip created while a separate recompute used a
-- different rule, so the figure disagreed with itself (fixed there in #145).
--
-- This recomputes the whole COUNT for the affected client on every change.
-- It is idempotent and self-healing: a missed event, a direct SQL edit, or a
-- restore cannot leave it permanently wrong, because the next write to that
-- client corrects it. A trigger that ADDS can only ever accumulate error.
--
-- Cancelled bookings are excluded — a cancelled booking is not a booking the
-- client made with you.
--
-- ── What this deliberately does NOT fix ─────────────────────────────────────
-- clients.total_revenue_generated has the identical problem: displayed, used
-- as a sort key, written by nothing, 0 on every row. It is left alone because
-- computing it means SUM(total_amount) across bookings that each carry their
-- OWN currency — mixing them into one figure is exactly the defect the audit
-- records as check 12, and adding a new instance of a known bug to fix another
-- is not a repair. It needs a currency decision first.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION recount_client_bookings(p_client_id UUID)
RETURNS void AS $$
BEGIN
  IF p_client_id IS NULL THEN RETURN; END IF;

  UPDATE clients c
     SET total_bookings_count = (
           SELECT count(*) FROM bookings b
            WHERE b.client_id = p_client_id
              AND COALESCE(b.status, '') <> 'cancelled'
         )
   WHERE c.id = p_client_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_client_booking_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Both sides, because a booking can be reassigned to a different client and
  -- the old one must lose it.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM recount_client_bookings(OLD.client_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM recount_client_bookings(NEW.client_id);
  END IF;
  RETURN NULL;   -- AFTER trigger
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_client_booking_count ON bookings;
CREATE TRIGGER trg_sync_client_booking_count
  AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION sync_client_booking_count();

-- Backfill every client from the real data, so the column starts correct
-- rather than correct-from-now-on.
UPDATE clients c
   SET total_bookings_count = (
         SELECT count(*) FROM bookings b
          WHERE b.client_id = c.id
            AND COALESCE(b.status, '') <> 'cancelled'
       );

-- --------------------------------------------------------------------------
-- Post-check: structure, and that the backfill agrees with the source.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  wrong INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'bookings' AND t.tgname = 'trg_sync_client_booking_count'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_sync_client_booking_count was not created';
  END IF;

  SELECT count(*) INTO wrong
    FROM clients c
   WHERE COALESCE(c.total_bookings_count, -1) <> (
           SELECT count(*) FROM bookings b
            WHERE b.client_id = c.id AND COALESCE(b.status,'') <> 'cancelled');

  IF wrong > 0 THEN
    RAISE EXCEPTION '% client(s) disagree with their own booking count after backfill', wrong;
  END IF;

  RAISE NOTICE 'booking counts backfilled and agree with bookings for all clients';
END $$;

COMMIT;
