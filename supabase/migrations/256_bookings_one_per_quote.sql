-- ============================================================================
-- 256 — one booking per quote, enforced by the database
-- ============================================================================
--
-- app/api/bookings/from-quote checks for an existing booking, then inserts.
-- Between those two statements there is nothing stopping a second request
-- from doing the same: a double-clicked "Convert to booking", a retried
-- request, or two staff acting at once produce TWO bookings for one accepted
-- quote — two booking numbers, two deposit amounts, two payment deadlines.
--
-- The check is also error-blind (`const { data: existingBooking }` discards
-- the error), so a transient failure on the SELECT looks identical to "no
-- booking exists" and duplicates single-threaded too.
--
-- A check-then-insert cannot be made safe in application code. The database
-- has to be the one saying no.
-- ============================================================================

-- Existing duplicates would block the index, so surface them rather than
-- failing cryptically half-way through. (Expected: none — bookings is empty
-- in production today.)
DO $$
DECLARE
  dupe_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dupe_count FROM (
    SELECT quote_id, quote_type
    FROM bookings
    WHERE quote_id IS NOT NULL
    GROUP BY quote_id, quote_type
    HAVING COUNT(*) > 1
  ) d;

  IF dupe_count > 0 THEN
    RAISE EXCEPTION
      'Cannot add the unique index: % quote(s) already have multiple bookings. '
      'Resolve them first: SELECT quote_id, quote_type, COUNT(*) FROM bookings '
      'WHERE quote_id IS NOT NULL GROUP BY 1,2 HAVING COUNT(*) > 1;', dupe_count;
  END IF;
END $$;

-- Partial: bookings created directly (no quote) are unconstrained, and NULL
-- quote_ids do not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_one_per_quote
  ON bookings (quote_id, quote_type)
  WHERE quote_id IS NOT NULL;

COMMENT ON INDEX uq_bookings_one_per_quote IS
  'One booking per quote. The API check-then-insert cannot be atomic; this '
  'is what actually prevents a double-clicked conversion from creating two '
  'bookings with two deposits. The route catches 23505 and returns the '
  'existing booking.';

-- ============================================================================
-- Verify after applying:
--   Convert a quote to a booking twice in quick succession — the second
--   returns 409 with the first booking's number, not a new booking.
-- ============================================================================
