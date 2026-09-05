-- =====================================================================
-- 325 — confirming an itinerary can create its booking; the deposit is
--       the ORG's rule, not a hardcoded 30%
-- =====================================================================
-- B-item 7 / A-item 7. Two schema blockers:
--
-- 1. bookings.quote_id / quote_type were NOT NULL, so a booking could only
--    ever be born from a quote — an itinerary confirmed directly (the
--    B2C flow's daily path) could not have one. Migration 256's partial
--    unique index already anticipated quote-less bookings ("bookings
--    created directly (no quote) are unconstrained, and NULL quote_ids do
--    not collide"); this makes them possible. The quote_type CHECK stays —
--    NULL passes a CHECK, so no change needed there.
--
-- 2. The deposit rule lived in code as `deposit_percent = 30` and a
--    payment deadline of now+7 days. tenants now carries the org's own
--    rule; NULL keeps meaning "the defaults", so existing tenants change
--    nothing until they set one (same convention as default_margin_percent,
--    migration 279). lib/bookings/deposit-rule.ts is the single resolver.

ALTER TABLE bookings ALTER COLUMN quote_id DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN quote_type DROP NOT NULL;

COMMENT ON COLUMN bookings.quote_id IS
  'The accepted quote this booking was converted from, when there is one. '
  'NULL for bookings created directly from a confirmed itinerary (mig 325). '
  'uq_bookings_one_per_quote only guards non-NULL quote_ids; direct '
  'bookings are deduplicated per itinerary by the confirm flow.';

-- One DIRECT booking per itinerary: the confirm flow's check-then-insert
-- cannot be atomic (same reasoning as migration 256). Quote-born bookings
-- are exempt — an itinerary can legitimately carry a quote-born booking,
-- and the quote index already guards those.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_direct_per_itinerary
  ON bookings (itinerary_id)
  WHERE quote_id IS NULL AND itinerary_id IS NOT NULL;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS deposit_percent NUMERIC
    CHECK (deposit_percent IS NULL OR (deposit_percent >= 0 AND deposit_percent <= 100)),
  ADD COLUMN IF NOT EXISTS deposit_due_days INT
    CHECK (deposit_due_days IS NULL OR (deposit_due_days >= 0 AND deposit_due_days <= 365));

COMMENT ON COLUMN tenants.deposit_percent IS
  'The org''s deposit rule for new bookings, in percent. NULL = the default '
  '(30). Resolved by lib/bookings/deposit-rule.ts: explicit request value → '
  'tenant → default, same shape as default_margin_percent.';
COMMENT ON COLUMN tenants.deposit_due_days IS
  'Days from booking creation until the deposit is due. NULL = the default (7).';

-- =====================================================================
-- Verify after applying:
--   1. Confirm an itinerary with dates and a selling price — a booking
--      appears with the tenant''s deposit rule applied.
--   2. Confirm it again — no second booking (409 from the unique index).
-- =====================================================================
