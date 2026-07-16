-- =====================================================================
-- Migration 231: Repair the email tables (supersedes 202 for production)
-- =====================================================================
-- The 2026-07 schema audit found migration 202 was never applied — and
-- cannot be applied as written: email_messages ALREADY exists in prod
-- with the migration-125 design (gmail_message_id, from_email,
-- unified_conversation_id), so 202's CREATE TABLE silently skips and
-- its index on conversation_id fails with 42703.
--
-- Deployed code uses BOTH flavors (125's in the working Gmail paths,
-- 202's in the conversations/sync paths), so the repair is ADDITIVE:
-- keep the live table, add 202's columns alongside (nullable — existing
-- rows can't satisfy 202's NOT NULLs; message_id uniqueness enforced by
-- a partial unique index). Also adds the tenant-scoped RLS that 202
-- shipped without.
-- =====================================================================

-- 1. Conversations (from 202, verbatim)
CREATE TABLE IF NOT EXISTS email_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  client_id UUID REFERENCES clients(id),
  client_email TEXT,
  client_name TEXT,
  subject TEXT,
  last_message_snippet TEXT,
  last_message_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  unread_count INTEGER DEFAULT 0,
  status VARCHAR(30) DEFAULT 'active',
  assigned_team_member_id UUID,
  assigned_at TIMESTAMPTZ,
  is_hidden BOOLEAN DEFAULT FALSE,
  hidden_at TIMESTAMPTZ,
  hidden_by UUID,
  gmail_history_id TEXT,
  emails_synced INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_conv_tenant ON email_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_conv_thread ON email_conversations(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_conv_user ON email_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_email_conv_status ON email_conversations(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_conv_thread_unique ON email_conversations(thread_id, user_id);

-- 2. email_messages: ADD 202's columns to the existing 125-flavor table.
--    Nullable by necessity; message_id uniqueness via partial index.
ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES email_conversations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS message_id TEXT,
  ADD COLUMN IF NOT EXISTS thread_id TEXT,
  ADD COLUMN IF NOT EXISTS from_address TEXT,
  ADD COLUMN IF NOT EXISTS to_addresses TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cc_addresses TEXT[],
  ADD COLUMN IF NOT EXISTS bcc_addresses TEXT[];

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_msg_message_id
  ON email_messages(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_msg_conv ON email_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_email_msg_thread ON email_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_msg_sent ON email_messages(sent_at DESC);

-- 3. Sync state (from 202, verbatim)
CREATE TABLE IF NOT EXISTS email_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  sync_status VARCHAR(20) DEFAULT 'idle',
  last_history_id TEXT,
  last_full_sync_at TIMESTAMPTZ,
  last_incremental_sync_at TIMESTAMPTZ,
  emails_synced INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Activity log (from 202, verbatim)
CREATE TABLE IF NOT EXISTS conversation_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES email_conversations(id) ON DELETE CASCADE,
  agent_id UUID,
  team_member_id UUID,
  action_type VARCHAR(50) NOT NULL,
  action_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conv_activity_conv ON conversation_activity(conversation_id);

-- 5. RLS: 202 shipped without any — a multi-tenant hole. Tenant members
--    see their tenant's conversations; sync state is per-user;
--    service_role passes everywhere (webhooks/cron).
ALTER TABLE email_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_conv_tenant_all ON email_conversations;
CREATE POLICY email_conv_tenant_all ON email_conversations
  FOR ALL
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());
DROP POLICY IF EXISTS email_conv_service ON email_conversations;
CREATE POLICY email_conv_service ON email_conversations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE conversation_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conv_activity_tenant_all ON conversation_activity;
CREATE POLICY conv_activity_tenant_all ON conversation_activity
  FOR ALL
  USING (EXISTS (SELECT 1 FROM email_conversations c
                 WHERE c.id = conversation_activity.conversation_id
                   AND c.tenant_id = get_user_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM email_conversations c
                      WHERE c.id = conversation_activity.conversation_id
                        AND c.tenant_id = get_user_tenant_id()));
DROP POLICY IF EXISTS conv_activity_service ON conversation_activity;
CREATE POLICY conv_activity_service ON conversation_activity
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE email_sync_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_sync_own ON email_sync_state;
CREATE POLICY email_sync_own ON email_sync_state
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS email_sync_service ON email_sync_state;
CREATE POLICY email_sync_service ON email_sync_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);
