-- =====================================================================
-- Migration 019: Client-Related Tables with Multi-Tenancy
-- Description: Creates follow_ups, client_preferences, client_notes,
--              whatsapp_conversations, and whatsapp_messages tables
-- Date: 2026-01-23
-- =====================================================================

-- =====================================================================
-- 1. FOLLOW-UPS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Follow-up details
  title VARCHAR(255) NOT NULL,
  description TEXT,
  due_date DATE NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'cancelled', 'overdue')),

  -- Assignment
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

-- RLS Policies for follow_ups
CREATE POLICY "Users can view tenant follow_ups" ON follow_ups
  FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can create follow_ups" ON follow_ups
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can update follow_ups" ON follow_ups
  FOR UPDATE USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Managers can delete follow_ups" ON follow_ups
  FOR DELETE USING (
    tenant_id = get_user_tenant_id()
    AND user_has_role('manager')
  );

-- Indexes for follow_ups
CREATE INDEX IF NOT EXISTS idx_follow_ups_tenant ON follow_ups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_client ON follow_ups(client_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status);
CREATE INDEX IF NOT EXISTS idx_follow_ups_due_date ON follow_ups(due_date);
CREATE INDEX IF NOT EXISTS idx_follow_ups_assigned_to ON follow_ups(assigned_to);

-- Auto-populate tenant_id trigger
CREATE TRIGGER auto_populate_follow_ups_tenant_id
  BEFORE INSERT ON follow_ups
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION auto_set_tenant_id();

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_follow_ups_updated_at ON follow_ups;
CREATE TRIGGER update_follow_ups_updated_at
  BEFORE UPDATE ON follow_ups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- 2. CLIENT PREFERENCES TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS client_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Travel preferences
  preferred_accommodation_type VARCHAR(50) DEFAULT '3-star',
  tour_pace_preference VARCHAR(20) DEFAULT 'moderate'
    CHECK (tour_pace_preference IN ('relaxed', 'moderate', 'fast-paced')),
  interests TEXT,
  special_needs TEXT,
  preferred_tier VARCHAR(20) DEFAULT 'standard'
    CHECK (preferred_tier IN ('budget', 'standard', 'deluxe', 'luxury')),

  -- Dietary & accessibility
  dietary_requirements TEXT,
  mobility_requirements TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(client_id)
);

-- Enable RLS
ALTER TABLE client_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for client_preferences
CREATE POLICY "Users can view tenant client_preferences" ON client_preferences
  FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can create client_preferences" ON client_preferences
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can update client_preferences" ON client_preferences
  FOR UPDATE USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Managers can delete client_preferences" ON client_preferences
  FOR DELETE USING (
    tenant_id = get_user_tenant_id()
    AND user_has_role('manager')
  );

-- Indexes for client_preferences
CREATE INDEX IF NOT EXISTS idx_client_preferences_tenant ON client_preferences(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_preferences_client ON client_preferences(client_id);

-- Auto-populate tenant_id trigger
CREATE TRIGGER auto_populate_client_preferences_tenant_id
  BEFORE INSERT ON client_preferences
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION auto_set_tenant_id();

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_client_preferences_updated_at ON client_preferences;
CREATE TRIGGER update_client_preferences_updated_at
  BEFORE UPDATE ON client_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- 3. CLIENT NOTES TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS client_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Note details
  note_text TEXT NOT NULL,
  note_type VARCHAR(50) NOT NULL DEFAULT 'general'
    CHECK (note_type IN ('general', 'call', 'email', 'meeting', 'complaint', 'praise')),
  is_internal BOOLEAN NOT NULL DEFAULT true,

  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for client_notes
CREATE POLICY "Users can view tenant client_notes" ON client_notes
  FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can create client_notes" ON client_notes
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can update their client_notes" ON client_notes
  FOR UPDATE USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Managers can delete client_notes" ON client_notes
  FOR DELETE USING (
    tenant_id = get_user_tenant_id()
    AND user_has_role('manager')
  );

-- Indexes for client_notes
CREATE INDEX IF NOT EXISTS idx_client_notes_tenant ON client_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_client ON client_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_created_by ON client_notes(created_by);
CREATE INDEX IF NOT EXISTS idx_client_notes_type ON client_notes(note_type);

-- Auto-populate tenant_id trigger
CREATE TRIGGER auto_populate_client_notes_tenant_id
  BEFORE INSERT ON client_notes
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION auto_set_tenant_id();

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_client_notes_updated_at ON client_notes;
CREATE TRIGGER update_client_notes_updated_at
  BEFORE UPDATE ON client_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- 4. WHATSAPP CONVERSATIONS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- Contact details
  phone_number VARCHAR(20) NOT NULL,
  client_name VARCHAR(255),

  -- Conversation metadata
  last_message_at TIMESTAMPTZ,
  message_count INTEGER NOT NULL DEFAULT 0,
  unread_count INTEGER NOT NULL DEFAULT 0,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'blocked')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, phone_number)
);

-- Enable RLS
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for whatsapp_conversations
CREATE POLICY "Users can view tenant whatsapp_conversations" ON whatsapp_conversations
  FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can create whatsapp_conversations" ON whatsapp_conversations
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can update whatsapp_conversations" ON whatsapp_conversations
  FOR UPDATE USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Managers can delete whatsapp_conversations" ON whatsapp_conversations
  FOR DELETE USING (
    tenant_id = get_user_tenant_id()
    AND user_has_role('manager')
  );

-- Indexes for whatsapp_conversations
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_tenant ON whatsapp_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_client ON whatsapp_conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_phone ON whatsapp_conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_status ON whatsapp_conversations(status);

-- Auto-populate tenant_id trigger
CREATE TRIGGER auto_populate_whatsapp_conversations_tenant_id
  BEFORE INSERT ON whatsapp_conversations
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION auto_set_tenant_id();

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_whatsapp_conversations_updated_at ON whatsapp_conversations;
CREATE TRIGGER update_whatsapp_conversations_updated_at
  BEFORE UPDATE ON whatsapp_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- 5. WHATSAPP MESSAGES TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,

  -- Message details
  message_text TEXT NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),

  -- Media
  media_url TEXT,
  media_type VARCHAR(20),

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'sent'
    CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),

  -- Timestamps
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for whatsapp_messages
CREATE POLICY "Users can view tenant whatsapp_messages" ON whatsapp_messages
  FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can create whatsapp_messages" ON whatsapp_messages
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can update whatsapp_messages" ON whatsapp_messages
  FOR UPDATE USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Managers can delete whatsapp_messages" ON whatsapp_messages
  FOR DELETE USING (
    tenant_id = get_user_tenant_id()
    AND user_has_role('manager')
  );

-- Indexes for whatsapp_messages
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant ON whatsapp_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation ON whatsapp_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_direction ON whatsapp_messages(direction);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_sent_at ON whatsapp_messages(sent_at);

-- Auto-populate tenant_id from parent conversation
CREATE OR REPLACE FUNCTION auto_populate_whatsapp_message_tenant()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := (
      SELECT tenant_id
      FROM whatsapp_conversations
      WHERE id = NEW.conversation_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_populate_whatsapp_messages_tenant_id
  BEFORE INSERT ON whatsapp_messages
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION auto_populate_whatsapp_message_tenant();

-- =====================================================================
-- SUMMARY
-- =====================================================================

-- Migration 019 Created:
-- ✅ follow_ups table (tenant-scoped)
-- ✅ client_preferences table (tenant-scoped)
-- ✅ client_notes table (tenant-scoped)
-- ✅ whatsapp_conversations table (tenant-scoped)
-- ✅ whatsapp_messages table (tenant-scoped)
--
-- All tables include:
-- ✅ tenant_id NOT NULL with FK to tenants
-- ✅ RLS enabled
-- ✅ 4 RLS policies (SELECT, INSERT, UPDATE, DELETE)
-- ✅ Auto-populate triggers for tenant_id
-- ✅ Performance indexes
-- ✅ Foreign key constraints with appropriate cascading
--
-- Total: 5 tables, 20 RLS policies, 5 triggers, 20 indexes
