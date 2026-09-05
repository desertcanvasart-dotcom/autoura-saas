-- =====================================================================
-- 322 — calculator quotes can become bookings; package_type CHECK learns
--       the app's actual vocabulary
-- =====================================================================
-- Two blockers in the quote → booking chain, both database-shaped:
--
-- 1. bookings.itinerary_id was NOT NULL, but migration 270 established
--    that CALCULATOR quotes have no itinerary — they are priced from a
--    tour variation. Every calculator quote's "Convert to booking"
--    therefore dead-ended ("Quote has no linked itinerary"), permanently.
--    A booking born from a calculator quote references the quote and its
--    variation; the itinerary link is optional. Consumers already treat
--    it as such (the bookings list/detail type the embed as `| null`,
--    sync-suppliers guards it).
--
-- 2. itineraries.package_type had CHECK (IN ('day-trips','tours-only',
--    'land-package','cruise-package','cruise-land')) from migration 000,
--    while the app's vocabulary (lib/package-types.ts, the pricing grid's
--    DEFAULT) grew 'full-package' and 'shore-excursions'. Every pricing-
--    grid save writes package_type 'full-package' → 23514 → HTTP 500.
--    The CHECK becomes the union of both vocabularies (the AI path's
--    'cruise-package' stays legal). lib/__tests__/package-type-check
--    pins the TS unions to this list so they cannot drift apart again.
-- =====================================================================

ALTER TABLE bookings ALTER COLUMN itinerary_id DROP NOT NULL;

COMMENT ON COLUMN bookings.itinerary_id IS
  'The itinerary this booking runs, when there is one. NULL for bookings '
  'converted from calculator quotes (b2b_quotes.variation_id points at the '
  'programme instead — migration 270/322).';

-- Replace whatever CHECK currently constrains package_type (the original is
-- unnamed/auto-named, so it is found by definition, not by name — never gate
-- logic on a constraint NAME). Dropping and re-adding makes this idempotent.
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'itineraries'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%package_type%'
  LOOP
    EXECUTE format('ALTER TABLE itineraries DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE itineraries ADD CONSTRAINT itineraries_package_type_allowed
  CHECK (package_type IS NULL OR package_type IN (
    'day-trips',
    'tours-only',
    'land-package',
    'full-package',
    'cruise-package',
    'cruise-land',
    'shore-excursions'
  ));

-- =====================================================================
-- Verify after applying:
--   1. Save from the pricing grid (its default package type is
--      'full-package') — the save succeeds instead of a 500.
--   2. Convert an accepted calculator quote (one with a variation and a
--      travel date, no itinerary) — a booking is created.
-- =====================================================================
