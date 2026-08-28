-- ============================================================================
-- 302 — booking_change_requests: the lead asks, the office approves (C1c)
-- ============================================================================
--
-- Adding people changes the price, so the portal cannot create passengers
-- beyond the booked count. The lead files a request from the booking-level
-- link; the office approves — which bumps the booked count, seeds blank
-- passenger rows (the portal then collects their details), and extends the
-- agreed per-person rate (lib/reprice-add-traveller.ts) — or rejects.
--
-- At most ONE pending request per booking: re-asking updates the existing
-- request rather than piling up duplicates for the operator.

BEGIN;

CREATE TABLE IF NOT EXISTS booking_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,

  kind TEXT NOT NULL DEFAULT 'add_traveller'
    CHECK (kind IN ('add_traveller')),
  -- How many EXTRA travellers beyond the current booked count.
  requested_count INTEGER NOT NULL CHECK (requested_count > 0),
  note TEXT,

  requested_via TEXT NOT NULL DEFAULT 'portal'
    CHECK (requested_via IN ('portal', 'operator')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID
);

CREATE INDEX IF NOT EXISTS idx_change_requests_booking
  ON booking_change_requests (booking_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_change_requests_one_pending
  ON booking_change_requests (booking_id)
  WHERE status = 'pending';

ALTER TABLE booking_change_requests ENABLE ROW LEVEL SECURITY;

-- The office reads its own; the portal writes via the service role behind
-- the token gate; resolution goes through the staff route (service role,
-- after an RLS-scoped booking check).
DROP POLICY IF EXISTS booking_change_requests_tenant_read ON booking_change_requests;
CREATE POLICY booking_change_requests_tenant_read ON booking_change_requests
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS booking_change_requests_service ON booking_change_requests;
CREATE POLICY booking_change_requests_service ON booking_change_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT count(*) FROM information_schema.columns
--   WHERE table_name = 'booking_change_requests';  -- expect 11
