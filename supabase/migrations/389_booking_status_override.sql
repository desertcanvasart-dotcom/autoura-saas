-- ============================================================================
-- 389 — Record who moved a booking on without its suppliers confirmed
-- ============================================================================
-- The booking page now has a status control (step 2 of the booking work,
-- after comparing with travel-ops-pro, 2026-09-25). Moving a booking to
-- In progress or Completed needs every still-needed supplier confirmed
-- (lib/bookings/booking-suppliers.ts). An operator may go ahead anyway —
-- the trip is real, the paperwork is behind — but that decision is recorded
-- here: { to, by, email, at, confirmed, total }. Any later status change
-- clears it, so it always describes the current status.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS status_override JSONB;

COMMENT ON COLUMN public.bookings.status_override IS
  'Set when the status was moved on although not every needed supplier was confirmed: {to, by, email, at, confirmed, total}. Cleared by the next status change.';
