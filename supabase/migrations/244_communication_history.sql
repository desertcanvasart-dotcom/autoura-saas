-- ============================================================================
-- 244 — communication_history: the manual client communications log
-- ============================================================================
--
-- Four components have read and written this table since they were built, but
-- it was never created. Reads returned nothing (the error was discarded, so the
-- Communications panel silently showed empty on every client) and writes threw,
-- so logging a call has never once worked:
--
--   app/clients/[id]/page.tsx      list the last 10 for a client
--   components/ClientTimeline.tsx  merge into the client timeline
--   components/LogCommunicationModal.tsx  insert / update / delete
--
-- The shape below is derived from what those components already send, not
-- invented — every column and every CHECK value comes from the modal's own form
-- options, so the existing UI works against it unchanged.
--
-- NOT the same thing as `communication_threads` / `communication_inbox`. Those
-- model an inbox: inbound messages, thread-scoped, with a source_message_id
-- from WhatsApp or Gmail. This is a human writing down that they phoned someone.
-- Different direction, different granularity, no external message to point at.
-- ============================================================================

CREATE TABLE IF NOT EXISTS communication_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Values are exactly the modal's <option> list. A channel the UI cannot
  -- produce would be a column nobody can fill.
  communication_type VARCHAR(20) NOT NULL
    CHECK (communication_type IN ('whatsapp', 'email', 'phone', 'meeting', 'video_call', 'sms', 'other')),

  direction VARCHAR(10) NOT NULL
    CHECK (direction IN ('inbound', 'outbound')),

  subject TEXT,
  content TEXT NOT NULL,

  -- When the conversation happened, NOT when the row was written. Operators log
  -- calls after the fact, so these differ and the timeline sorts on this one.
  communication_date TIMESTAMPTZ NOT NULL DEFAULT now(),

  status VARCHAR(20) NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'pending', 'scheduled')),

  -- Who logged it. SET NULL rather than CASCADE: a staff member leaving must
  -- not delete the client's history.
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The only query the app makes: by client, newest first.
CREATE INDEX IF NOT EXISTS idx_comm_history_client_date
  ON communication_history(client_id, communication_date DESC);
CREATE INDEX IF NOT EXISTS idx_comm_history_tenant
  ON communication_history(tenant_id);

-- --------------------------------------------------------------------------
-- tenant_id is filled by trigger, not by the client.
--
-- LogCommunicationModal inserts from the browser and does NOT send tenant_id —
-- against a NOT NULL column every insert would fail. `auto_set_tenant_id()`
-- (migration 007) is the established convention for exactly this, and it is
-- SECURITY DEFINER so it resolves the caller's tenant. The RLS INSERT policy
-- below still checks the result, so a forged tenant_id is rejected rather than
-- trusted.
-- --------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_tenant_id_communication_history ON communication_history;
CREATE TRIGGER set_tenant_id_communication_history
  BEFORE INSERT ON communication_history
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_tenant_id();

CREATE OR REPLACE FUNCTION touch_communication_history()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_communication_history_trg ON communication_history;
CREATE TRIGGER touch_communication_history_trg
  BEFORE UPDATE ON communication_history
  FOR EACH ROW
  EXECUTE FUNCTION touch_communication_history();

-- --------------------------------------------------------------------------
-- RLS. Every policy is scoped `TO authenticated` — migration 242 had to go back
-- and narrow a dozen policies that omitted this and were therefore readable by
-- the public anon key. Not repeating that here.
-- --------------------------------------------------------------------------
ALTER TABLE communication_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comm_history_select ON communication_history;
CREATE POLICY comm_history_select ON communication_history
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS comm_history_insert ON communication_history;
CREATE POLICY comm_history_insert ON communication_history
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS comm_history_update ON communication_history;
CREATE POLICY comm_history_update ON communication_history
  FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Anyone in the tenant may delete an entry they can see. A mistyped log is
-- corrected by the person who wrote it, and no role hierarchy exists in the UI
-- for this feature to hang a narrower rule on.
DROP POLICY IF EXISTS comm_history_delete ON communication_history;
CREATE POLICY comm_history_delete ON communication_history
  FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS comm_history_service_role ON communication_history;
CREATE POLICY comm_history_service_role ON communication_history
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE communication_history IS
  'Manually logged client communications — calls, meetings, messages an operator '
  'records after the fact. Distinct from communication_inbox/threads, which hold '
  'actual inbound messages synced from WhatsApp and Gmail.';

COMMENT ON COLUMN communication_history.communication_date IS
  'When the communication happened, not when it was logged. The timeline sorts on this.';

-- ============================================================================
-- Verify after applying:
--   npm run verify:rls          -- must stay green; nothing anonymous
--   Open a client -> Communications: log a call, reload, confirm it persists.
-- ============================================================================
