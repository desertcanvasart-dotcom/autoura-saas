-- ============================================
-- Migration 202: Create email conversation/message/sync tables
-- ============================================

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
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_conv_tenant ON email_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_conv_thread ON email_conversations(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_conv_user ON email_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_email_conv_status ON email_conversations(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_conv_thread_unique ON email_conversations(thread_id, user_id);

CREATE TABLE IF NOT EXISTS email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES email_conversations(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL UNIQUE,
  thread_id TEXT NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_address TEXT NOT NULL,
  to_addresses TEXT[] DEFAULT '{}',
  cc_addresses TEXT[],
  bcc_addresses TEXT[],
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  snippet TEXT,
  attachments JSONB DEFAULT '[]',
  is_read BOOLEAN DEFAULT FALSE,
  is_starred BOOLEAN DEFAULT FALSE,
  labels TEXT[],
  sent_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_msg_conv ON email_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_email_msg_thread ON email_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_msg_sent ON email_messages(sent_at DESC);

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

CREATE TABLE IF NOT EXISTS conversation_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES email_conversations(id) ON DELETE CASCADE,
  agent_id UUID,
  team_member_id UUID,
  action_type VARCHAR(50) NOT NULL,
  action_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
