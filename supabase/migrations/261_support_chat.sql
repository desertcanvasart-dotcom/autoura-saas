-- ============================================================================
-- 261 — in-app support chat: tenants ↔ platform support
-- ============================================================================
--
-- One ongoing support thread per tenant (the UI treats the newest open
-- conversation as "the" thread; the schema allows several so closed threads
-- keep their history and a future ticket model needs no migration).
--
-- Access model:
--   * Tenant members read/write their own tenant's thread through the
--     AUTHENTICATED client — RLS below is the boundary. Tenants can only
--     write messages AS the tenant (sender_type = 'tenant'): a WITH CHECK
--     enforces it, so a compromised session cannot forge platform replies.
--   * Platform support (super-admin) reads and replies through the
--     service-role client in /api/super-admin/support — no tenant policy
--     grants cross-tenant access.
--   * support_messages joins the realtime publication so the tenant widget
--     gets replies pushed live; RLS governs what each subscriber sees.
--
-- tenant_id is denormalized onto support_messages so both RLS and the
-- realtime filter work without a join.

BEGIN;

CREATE TABLE IF NOT EXISTS support_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_conversations_tenant
  ON support_conversations (tenant_id, status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('tenant', 'support')),
  -- NULL for platform replies (support users are not tenant members).
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 8000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_conversation
  ON support_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_messages_tenant
  ON support_messages (tenant_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
ALTER TABLE support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_conversations_tenant_read ON support_conversations;
CREATE POLICY support_conversations_tenant_read ON support_conversations
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS support_conversations_tenant_insert ON support_conversations;
CREATE POLICY support_conversations_tenant_insert ON support_conversations
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS support_messages_tenant_read ON support_messages;
CREATE POLICY support_messages_tenant_read ON support_messages
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- Tenants write only as themselves — sender_type is pinned in the policy,
-- not just the app layer.
DROP POLICY IF EXISTS support_messages_tenant_insert ON support_messages;
CREATE POLICY support_messages_tenant_insert ON support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND sender_type = 'tenant'
    AND sender_user_id = auth.uid()
  );

-- Service role (super-admin routes, notifications) — full access.
DROP POLICY IF EXISTS support_conversations_service_role ON support_conversations;
CREATE POLICY support_conversations_service_role ON support_conversations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS support_messages_service_role ON support_messages;
CREATE POLICY support_messages_service_role ON support_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- Realtime: tenant widgets subscribe to support_messages inserts. Guarded —
-- re-running the migration must not fail on "already member of publication".
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE support_messages;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'support_messages already in supabase_realtime';
END $$;

-- ----------------------------------------------------------------------------
-- Post-check
-- ----------------------------------------------------------------------------
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE tablename IN ('support_conversations', 'support_messages');
  IF n < 6 THEN
    RAISE EXCEPTION 'expected >= 6 support policies, found %', n;
  END IF;

  PERFORM 1 FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime' AND tablename = 'support_messages';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support_messages missing from supabase_realtime publication';
  END IF;

  RAISE NOTICE 'post-check OK: support chat schema ready';
END $$;

COMMIT;
