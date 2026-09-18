-- ============================================================================
-- 364 — A share link remembers what was approved about its price
-- ============================================================================
--
-- Since the itinerary delivery gates, a share link for an itinerary whose
-- services have no cost is only created when the operator says "share anyway".
-- That approval is not recorded anywhere, and the public page never looks
-- again: a service that loses its cost AFTER the link went out still shows the
-- traveller a total that leaves it out.
--
-- The link now records exactly which gaps the approval covered, when, and by
-- whom. The public page re-checks on every view and shows the price only while
-- every current gap is one of those; a NEW gap withholds the price (the
-- itinerary itself still shows) until the operator looks again.
--
-- incomplete_approved_gaps is a list of {day, name}. NULL means nothing was
-- approved, so any gap withholds the price — the safe reading for every link
-- that already exists. No foreign key on the approver: this row is a record of
-- what happened, and it must survive the user being removed.
-- ============================================================================

BEGIN;

ALTER TABLE public.itinerary_shares
  ADD COLUMN IF NOT EXISTS incomplete_approved_gaps jsonb,
  ADD COLUMN IF NOT EXISTS incomplete_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS incomplete_approved_by uuid;

COMMENT ON COLUMN public.itinerary_shares.incomplete_approved_gaps IS
  'Services with no cost that the operator approved sharing, as [{day, name}]. The public page withholds the price if any other gap appears.';

COMMIT;
