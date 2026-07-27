-- ============================================================================
-- 253 — itinerary_shares: the shareable itinerary link
-- ============================================================================
--
-- Step 3 of the documents work: instead of (only) a PDF attachment, an
-- itinerary gets a link — one branded page the traveller can open before,
-- during and after the trip, always showing the current version.
--
-- Security model, decided up front:
--   * The public page NEVER touches this table with the anon key. It is a
--     server component using the service role, which validates the token and
--     selects CLIENT-FACING fields only (lib/itinerary-share.ts strips
--     supplier costs, margins and internal notes — tested). So RLS here has
--     no anon policies at all: the table is invisible to the public, and the
--     token check happens in code that can also check revocation and log the
--     view.
--   * Tokens are 128+ bits from crypto randomness — unguessable, and useless
--     after revoked_at is set.
--   * One ACTIVE share per itinerary (partial unique): re-sharing returns the
--     same link rather than minting infinite URLs for one trip, and revoking
--     kills the only link that exists.
-- ============================================================================

CREATE TABLE IF NOT EXISTS itinerary_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,

  -- URL token. Base64url of 24 random bytes (192 bits) — generated in
  -- lib/itinerary-share.ts, never by the database.
  token TEXT NOT NULL UNIQUE,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A revoked share stays as a record of what was shared and when; the token
  -- simply stops resolving. Deleting the row would erase the audit trail.
  revoked_at TIMESTAMPTZ,

  -- Lightweight engagement signal for the operator ("has the client looked?").
  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ
);

-- One live link per itinerary. Partial unique is correct here (integrity, not
-- an ON CONFLICT target — the 248 rule): a second active share fails loudly,
-- and revoked rows do not block a fresh share.
CREATE UNIQUE INDEX IF NOT EXISTS uq_itinerary_shares_active
  ON itinerary_shares (itinerary_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_itinerary_shares_tenant
  ON itinerary_shares (tenant_id);

ALTER TABLE itinerary_shares ENABLE ROW LEVEL SECURITY;

-- Staff manage their tenant's shares (create from the itinerary page, revoke).
DROP POLICY IF EXISTS itinerary_shares_tenant ON itinerary_shares;
CREATE POLICY itinerary_shares_tenant ON itinerary_shares
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS itinerary_shares_service_role ON itinerary_shares;
CREATE POLICY itinerary_shares_service_role ON itinerary_shares
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- NO anon policies, deliberately: the public page resolves tokens through the
-- service role so revocation and view-counting cannot be bypassed, and the
-- token list itself is never queryable from a browser.

COMMENT ON TABLE itinerary_shares IS
  'Public share links for itineraries. Token-gated via the /share/[token] '
  'server component (service role) — never readable with the anon key. One '
  'active share per itinerary; revocation keeps the row, kills the link.';

-- ============================================================================
-- Verify after applying:
--   npm run verify:rls   -- itinerary_shares is in the guarded list
--   Share an itinerary, open the link signed OUT, then revoke and confirm the
--   link dies.
-- ============================================================================
