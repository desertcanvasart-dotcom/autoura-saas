-- ============================================================================
-- 300 — booking_portal_links: the customer portal's credential (C1a)
-- ============================================================================
--
-- C1 of docs/plans/parity-campaign.md, first slice. A booking gets portal
-- links: ONE booking-level link (the lead/family link) and optionally one
-- PRIVATE link per passenger. The token in the URL is the credential; a
-- confirmation gate (name/booking number — plus date of birth on private
-- links) guards against forwarded URLs before anything renders
-- (lib/booking-portal.ts).
--
--   passenger_id NULL  = booking-level link (sees all travellers)
--   passenger_id set   = that traveller's private link (sees only themself)
--
-- One LIVE link per (booking, passenger): minting reuses the unrevoked row.
-- A revoked link keeps its row as the record of what was shared and when.

BEGIN;

CREATE TABLE IF NOT EXISTS booking_portal_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  passenger_id UUID REFERENCES booking_passengers(id) ON DELETE CASCADE,

  -- base64url of 24 random bytes (lib/booking-portal.ts).
  token TEXT NOT NULL UNIQUE,

  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  -- Set from the trip's start date at mint time (+30 days); NULL = no expiry.
  expires_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  -- The office can freeze the traveller form once details are confirmed.
  form_locked BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_portal_links_booking
  ON booking_portal_links (booking_id);
CREATE INDEX IF NOT EXISTS idx_portal_links_tenant
  ON booking_portal_links (tenant_id, created_at DESC);

ALTER TABLE booking_portal_links ENABLE ROW LEVEL SECURITY;

-- The office manages its own links; the portal itself reads via service role.
DROP POLICY IF EXISTS booking_portal_links_tenant ON booking_portal_links;
CREATE POLICY booking_portal_links_tenant ON booking_portal_links
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS booking_portal_links_service ON booking_portal_links;
CREATE POLICY booking_portal_links_service ON booking_portal_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT count(*) FROM information_schema.columns
--   WHERE table_name = 'booking_portal_links';   -- expect 11
--   SELECT polname FROM pg_policy
--   WHERE polrelid = 'booking_portal_links'::regclass;  -- expect 2
