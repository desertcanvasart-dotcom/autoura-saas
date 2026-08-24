-- ============================================================================
-- 291 — trip_messages: the two-way thread between traveller and office
-- ============================================================================
--
-- Customer-side v2, second slice (after "Report a problem"): the traveller on
-- the share page can message the office and read replies — a thread scoped to
-- one trip. This is the execution-layer answer to coordination leaking into
-- personal WhatsApp side-channels.
--
-- Design decisions:
--
--   ONE TABLE, NOT A NEW MESSAGING SYSTEM. Each row links to the tenant's
--   unified_conversations record (the comms anchor the office already
--   watches), so trip threads surface in the unified conversations view
--   alongside WhatsApp and email. Message content lives here, keyed by
--   itinerary — the thread is the trip's.
--
--   DIRECTION IS PINNED BY RLS. authenticated (the office) may only INSERT
--   direction='outbound' — a tenant user cannot forge a traveller message
--   (the support-chat lesson, mig 261: WITH CHECK pins the sender). Inbound
--   rows are written exclusively by the service role behind the token-guarded
--   share route.
--
--   NO UPDATE/DELETE FOR THE APP beyond marking read: messages are a record.
--   (service_role retains full access for operational repair.)
--
--   sender_name IS DISPLAY TEXT (traveller's typed name inbound; team member
--   name outbound). team_member_id records the outbound author properly.

BEGIN;

CREATE TABLE IF NOT EXISTS trip_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  -- The comms anchor. SET NULL: the thread survives conversation cleanup.
  unified_conversation_id UUID REFERENCES unified_conversations(id) ON DELETE SET NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content TEXT NOT NULL,
  sender_name VARCHAR(120),
  -- Outbound author (mig 288 made team_members the one people-model).
  team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_messages_itinerary
  ON trip_messages (itinerary_id, created_at);
CREATE INDEX IF NOT EXISTS idx_trip_messages_tenant
  ON trip_messages (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_messages_conversation
  ON trip_messages (unified_conversation_id);

ALTER TABLE trip_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trip_messages_tenant_read ON trip_messages;
CREATE POLICY trip_messages_tenant_read ON trip_messages
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- The office can only speak as the office.
DROP POLICY IF EXISTS trip_messages_tenant_insert ON trip_messages;
CREATE POLICY trip_messages_tenant_insert ON trip_messages
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND direction = 'outbound');

-- Marking traveller messages read is the only update the app needs.
DROP POLICY IF EXISTS trip_messages_tenant_mark_read ON trip_messages;
CREATE POLICY trip_messages_tenant_mark_read ON trip_messages
  FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Deliberately NO delete policy for authenticated.

DROP POLICY IF EXISTS trip_messages_service_role ON trip_messages;
CREATE POLICY trip_messages_service_role ON trip_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- --------------------------------------------------------------------------
-- Post-check (run after COMMIT):
--   1. Structure:
--      SELECT count(*) FROM information_schema.columns
--      WHERE table_name = 'trip_messages';          -- expect 10
--   2. RLS is ON with the four policies:
--      SELECT polname FROM pg_policy
--      WHERE polrelid = 'trip_messages'::regclass;  -- expect 4 rows
--   3. Behavioural probe (service role): INSERT an inbound + an outbound row
--      for a real itinerary, read both back ordered by created_at, then
--      DELETE them. A bogus direction must be rejected:
--      INSERT ... direction='sideways'  -- expect CHECK violation
