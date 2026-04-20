-- ============================================
-- MIGRATION: AI Communication Copilot (Multi-Tenant)
-- ============================================
-- Creates tables for the AI-driven communication copilot:
-- 1. communication_threads  — groups messages per conversation
-- 2. communication_inbox    — inbound messages needing response
-- 3. communication_drafts   — AI-generated draft replies
-- 4. copilot_settings       — per-user copilot preferences
-- ============================================

-- ============================================
-- TABLE 1: communication_threads
-- ============================================
CREATE TABLE IF NOT EXISTS communication_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  whatsapp_conversation_id UUID,
  email_conversation_id UUID,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT,
  contact_info TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting', 'resolved', 'archived')),
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'urgent')),
  last_message_at TIMESTAMPTZ,
  last_draft_at TIMESTAMPTZ,
  message_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_threads_tenant ON communication_threads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_comm_threads_channel ON communication_threads(channel);
CREATE INDEX IF NOT EXISTS idx_comm_threads_status ON communication_threads(status);
CREATE INDEX IF NOT EXISTS idx_comm_threads_client_id ON communication_threads(client_id);
CREATE INDEX IF NOT EXISTS idx_comm_threads_last_message_at ON communication_threads(last_message_at DESC);

-- ============================================
-- TABLE 2: communication_inbox
-- ============================================
CREATE TABLE IF NOT EXISTS communication_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES communication_threads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  source_message_id TEXT NOT NULL,
  sender_name TEXT,
  sender_contact TEXT NOT NULL,
  message_body TEXT NOT NULL,
  message_snippet TEXT,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'draft_pending', 'draft_ready', 'responded', 'skipped')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, channel, source_message_id)
);

CREATE INDEX IF NOT EXISTS idx_comm_inbox_tenant ON communication_inbox(tenant_id);
CREATE INDEX IF NOT EXISTS idx_comm_inbox_thread_id ON communication_inbox(thread_id);
CREATE INDEX IF NOT EXISTS idx_comm_inbox_status ON communication_inbox(status);
CREATE INDEX IF NOT EXISTS idx_comm_inbox_received_at ON communication_inbox(received_at DESC);

-- ============================================
-- TABLE 3: communication_drafts
-- ============================================
CREATE TABLE IF NOT EXISTS communication_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES communication_threads(id) ON DELETE CASCADE,
  inbox_message_id UUID NOT NULL REFERENCES communication_inbox(id) ON DELETE CASCADE,
  parent_draft_id UUID REFERENCES communication_drafts(id) ON DELETE SET NULL,
  draft_body TEXT NOT NULL,
  edited_body TEXT,
  was_edited BOOLEAN NOT NULL DEFAULT FALSE,
  operator_notes TEXT,
  ai_model TEXT,
  ai_confidence TEXT CHECK (ai_confidence IN ('high', 'medium', 'low')),
  ai_flags JSONB DEFAULT '{}'::jsonb,
  context_used JSONB DEFAULT '{}'::jsonb,
  generation_time_ms INT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'sent', 'expired')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  send_channel TEXT CHECK (send_channel IN ('whatsapp', 'email')),
  send_message_id TEXT,
  send_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_drafts_tenant ON communication_drafts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_comm_drafts_thread_id ON communication_drafts(thread_id);
CREATE INDEX IF NOT EXISTS idx_comm_drafts_inbox_msg ON communication_drafts(inbox_message_id);
CREATE INDEX IF NOT EXISTS idx_comm_drafts_status ON communication_drafts(status);

-- ============================================
-- TABLE 4: copilot_settings
-- ============================================
CREATE TABLE IF NOT EXISTS copilot_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tone TEXT NOT NULL DEFAULT 'professional' CHECK (tone IN ('professional', 'friendly', 'formal')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE communication_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_settings ENABLE ROW LEVEL SECURITY;

-- Tenant-isolated access
CREATE POLICY "Tenant members can view threads"
  ON communication_threads FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE POLICY "Tenant members can insert threads"
  ON communication_threads FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE POLICY "Tenant members can update threads"
  ON communication_threads FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE POLICY "Tenant members can view inbox"
  ON communication_inbox FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE POLICY "Tenant members can insert inbox"
  ON communication_inbox FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE POLICY "Tenant members can update inbox"
  ON communication_inbox FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE POLICY "Tenant members can view drafts"
  ON communication_drafts FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE POLICY "Tenant members can insert drafts"
  ON communication_drafts FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE POLICY "Tenant members can update drafts"
  ON communication_drafts FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can view own copilot settings"
  ON copilot_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own copilot settings"
  ON copilot_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own copilot settings"
  ON copilot_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_communication_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_comm_threads_updated_at
  BEFORE UPDATE ON communication_threads
  FOR EACH ROW EXECUTE FUNCTION update_communication_updated_at();

CREATE TRIGGER trigger_copilot_settings_updated_at
  BEFORE UPDATE ON copilot_settings
  FOR EACH ROW EXECUTE FUNCTION update_communication_updated_at();
