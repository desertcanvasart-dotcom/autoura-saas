-- Migration: Unified Conversations System
-- Purpose: Create a unified view that merges WhatsApp + Email conversations per customer

-- ============================================
-- 1. UNIFIED CONVERSATIONS TABLE
-- Links a contact to all their communication channels
-- ============================================

CREATE TABLE IF NOT EXISTS unified_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Contact reference (the person we're communicating with)
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- Denormalized contact info for quick access/display
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),

  -- Channel links
  whatsapp_conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,

  -- Summary stats
  total_messages INTEGER DEFAULT 0,
  unread_messages INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  last_message_channel VARCHAR(20), -- 'whatsapp', 'email'

  -- Assignment (synced from WhatsApp or can be set independently)
  assigned_team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,

  -- Status
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'blocked')),
  is_starred BOOLEAN DEFAULT FALSE,

  -- Tags for organization
  tags TEXT[],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(tenant_id, contact_email),
  UNIQUE(tenant_id, contact_phone)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_unified_conv_tenant ON unified_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_unified_conv_client ON unified_conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_unified_conv_last_msg ON unified_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_unified_conv_status ON unified_conversations(status);
CREATE INDEX IF NOT EXISTS idx_unified_conv_assigned ON unified_conversations(assigned_team_member_id);

-- ============================================
-- 2. EMAIL MESSAGES TABLE
-- Cache Gmail emails in database for unified search/display
-- ============================================

CREATE TABLE IF NOT EXISTS email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Link to unified conversation
  unified_conversation_id UUID REFERENCES unified_conversations(id) ON DELETE CASCADE,

  -- Gmail identifiers (for sync)
  gmail_message_id VARCHAR(255) NOT NULL,
  gmail_thread_id VARCHAR(255),

  -- Email metadata
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(255),
  to_email VARCHAR(255) NOT NULL,
  to_name VARCHAR(255),
  cc_emails TEXT[],
  bcc_emails TEXT[],
  subject TEXT,

  -- Email content
  body_text TEXT,
  body_html TEXT,
  snippet TEXT, -- Short preview

  -- Direction
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),

  -- Attachments (JSONB array)
  attachments JSONB DEFAULT '[]'::jsonb,

  -- Labels/categories from Gmail
  labels TEXT[],

  -- Status
  is_read BOOLEAN DEFAULT FALSE,
  is_starred BOOLEAN DEFAULT FALSE,
  is_important BOOLEAN DEFAULT FALSE,

  -- Timestamps
  sent_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicates
  UNIQUE(tenant_id, gmail_message_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_messages_tenant ON email_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_unified ON email_messages(unified_conversation_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_thread ON email_messages(gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_sent ON email_messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_from ON email_messages(from_email);
CREATE INDEX IF NOT EXISTS idx_email_messages_to ON email_messages(to_email);

-- ============================================
-- 3. UNIFIED MESSAGES VIEW
-- Combines WhatsApp and Email messages into single timeline
-- ============================================

CREATE OR REPLACE VIEW unified_messages AS
SELECT
  'whatsapp' AS channel,
  wm.id,
  wm.tenant_id,
  uc.id AS unified_conversation_id,
  wc.phone_number AS contact_identifier,
  wm.message_text AS content,
  NULL AS subject,
  wm.direction,
  wm.media_url,
  wm.media_type,
  wm.status,
  wm.sent_at AS message_at,
  CASE WHEN wm.status = 'read' THEN TRUE ELSE FALSE END AS is_read,
  wm.created_at
FROM whatsapp_messages wm
JOIN whatsapp_conversations wc ON wm.conversation_id = wc.id
LEFT JOIN unified_conversations uc ON uc.whatsapp_conversation_id = wc.id

UNION ALL

SELECT
  'email' AS channel,
  em.id,
  em.tenant_id,
  em.unified_conversation_id,
  CASE WHEN em.direction = 'inbound' THEN em.from_email ELSE em.to_email END AS contact_identifier,
  COALESCE(em.body_text, em.snippet) AS content,
  em.subject,
  em.direction,
  NULL AS media_url,
  NULL AS media_type,
  CASE WHEN em.is_read THEN 'read' ELSE 'delivered' END AS status,
  em.sent_at AS message_at,
  em.is_read,
  em.created_at
FROM email_messages em;

-- ============================================
-- 4. FUNCTION: Find or Create Unified Conversation
-- ============================================

CREATE OR REPLACE FUNCTION find_or_create_unified_conversation(
  p_tenant_id UUID,
  p_email VARCHAR DEFAULT NULL,
  p_phone VARCHAR DEFAULT NULL,
  p_name VARCHAR DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_conversation_id UUID;
  v_client_id UUID;
  v_whatsapp_conv_id UUID;
BEGIN
  -- First, try to find existing by email
  IF p_email IS NOT NULL THEN
    SELECT id INTO v_conversation_id
    FROM unified_conversations
    WHERE tenant_id = p_tenant_id AND contact_email = p_email;

    IF v_conversation_id IS NOT NULL THEN
      RETURN v_conversation_id;
    END IF;
  END IF;

  -- Then try by phone
  IF p_phone IS NOT NULL THEN
    SELECT id INTO v_conversation_id
    FROM unified_conversations
    WHERE tenant_id = p_tenant_id AND contact_phone = p_phone;

    IF v_conversation_id IS NOT NULL THEN
      -- Update email if we now have it
      IF p_email IS NOT NULL THEN
        UPDATE unified_conversations
        SET contact_email = p_email, updated_at = NOW()
        WHERE id = v_conversation_id;
      END IF;
      RETURN v_conversation_id;
    END IF;
  END IF;

  -- Try to find a client match
  SELECT id INTO v_client_id
  FROM clients
  WHERE tenant_id = p_tenant_id
    AND (
      (p_email IS NOT NULL AND email = p_email)
      OR (p_phone IS NOT NULL AND (phone = p_phone OR whatsapp = p_phone))
    )
  LIMIT 1;

  -- Try to find WhatsApp conversation
  IF p_phone IS NOT NULL THEN
    SELECT id INTO v_whatsapp_conv_id
    FROM whatsapp_conversations
    WHERE tenant_id = p_tenant_id AND phone_number = p_phone
    LIMIT 1;
  END IF;

  -- Create new unified conversation
  INSERT INTO unified_conversations (
    tenant_id,
    client_id,
    contact_name,
    contact_email,
    contact_phone,
    whatsapp_conversation_id
  ) VALUES (
    p_tenant_id,
    v_client_id,
    COALESCE(p_name, 'Unknown'),
    p_email,
    p_phone,
    v_whatsapp_conv_id
  )
  RETURNING id INTO v_conversation_id;

  RETURN v_conversation_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. FUNCTION: Update Unified Conversation Stats
-- ============================================

CREATE OR REPLACE FUNCTION update_unified_conversation_stats(p_unified_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total INTEGER := 0;
  v_unread INTEGER := 0;
  v_last_at TIMESTAMPTZ;
  v_last_preview TEXT;
  v_last_channel VARCHAR(20);
BEGIN
  -- Count WhatsApp messages
  SELECT
    COUNT(*),
    SUM(CASE WHEN status != 'read' AND direction = 'inbound' THEN 1 ELSE 0 END),
    MAX(sent_at)
  INTO v_total, v_unread, v_last_at
  FROM whatsapp_messages wm
  JOIN whatsapp_conversations wc ON wm.conversation_id = wc.id
  JOIN unified_conversations uc ON uc.whatsapp_conversation_id = wc.id
  WHERE uc.id = p_unified_id;

  -- Add email messages
  SELECT
    v_total + COUNT(*),
    v_unread + SUM(CASE WHEN NOT is_read AND direction = 'inbound' THEN 1 ELSE 0 END),
    GREATEST(v_last_at, MAX(sent_at))
  INTO v_total, v_unread, v_last_at
  FROM email_messages
  WHERE unified_conversation_id = p_unified_id;

  -- Get last message preview
  SELECT content, channel INTO v_last_preview, v_last_channel
  FROM unified_messages
  WHERE unified_conversation_id = p_unified_id
  ORDER BY message_at DESC
  LIMIT 1;

  -- Update stats
  UPDATE unified_conversations
  SET
    total_messages = COALESCE(v_total, 0),
    unread_messages = COALESCE(v_unread, 0),
    last_message_at = v_last_at,
    last_message_preview = LEFT(v_last_preview, 100),
    last_message_channel = v_last_channel,
    updated_at = NOW()
  WHERE id = p_unified_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. TRIGGER: Sync WhatsApp Conversations
-- When a WhatsApp conversation is created, create unified conversation
-- ============================================

CREATE OR REPLACE FUNCTION sync_whatsapp_to_unified()
RETURNS TRIGGER AS $$
DECLARE
  v_unified_id UUID;
BEGIN
  -- Find or create unified conversation
  SELECT find_or_create_unified_conversation(
    NEW.tenant_id,
    NULL,  -- no email
    NEW.phone_number,
    NEW.client_name
  ) INTO v_unified_id;

  -- Link WhatsApp conversation to unified
  UPDATE unified_conversations
  SET
    whatsapp_conversation_id = NEW.id,
    client_id = COALESCE(client_id, NEW.client_id),
    contact_name = COALESCE(contact_name, NEW.client_name),
    updated_at = NOW()
  WHERE id = v_unified_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop first if exists)
DROP TRIGGER IF EXISTS trg_sync_whatsapp_to_unified ON whatsapp_conversations;
CREATE TRIGGER trg_sync_whatsapp_to_unified
  AFTER INSERT ON whatsapp_conversations
  FOR EACH ROW
  EXECUTE FUNCTION sync_whatsapp_to_unified();

-- ============================================
-- 7. TRIGGER: Update stats on new WhatsApp message
-- ============================================

CREATE OR REPLACE FUNCTION update_unified_on_whatsapp_message()
RETURNS TRIGGER AS $$
DECLARE
  v_unified_id UUID;
BEGIN
  -- Find unified conversation for this WhatsApp conversation
  SELECT id INTO v_unified_id
  FROM unified_conversations
  WHERE whatsapp_conversation_id = NEW.conversation_id;

  IF v_unified_id IS NOT NULL THEN
    PERFORM update_unified_conversation_stats(v_unified_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_unified_on_whatsapp ON whatsapp_messages;
CREATE TRIGGER trg_update_unified_on_whatsapp
  AFTER INSERT ON whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_unified_on_whatsapp_message();

-- ============================================
-- 8. TRIGGER: Update stats on new email message
-- ============================================

CREATE OR REPLACE FUNCTION update_unified_on_email_message()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.unified_conversation_id IS NOT NULL THEN
    PERFORM update_unified_conversation_stats(NEW.unified_conversation_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_unified_on_email ON email_messages;
CREATE TRIGGER trg_update_unified_on_email
  AFTER INSERT ON email_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_unified_on_email_message();

-- ============================================
-- 9. RLS POLICIES
-- ============================================

ALTER TABLE unified_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;

-- Policy for unified_conversations
DROP POLICY IF EXISTS unified_conversations_tenant_policy ON unified_conversations;
CREATE POLICY unified_conversations_tenant_policy ON unified_conversations
  FOR ALL
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Policy for email_messages
DROP POLICY IF EXISTS email_messages_tenant_policy ON email_messages;
CREATE POLICY email_messages_tenant_policy ON email_messages
  FOR ALL
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

-- ============================================
-- 10. MIGRATE EXISTING WHATSAPP CONVERSATIONS
-- Create unified conversations for existing WhatsApp conversations
-- ============================================

INSERT INTO unified_conversations (
  tenant_id,
  client_id,
  contact_name,
  contact_phone,
  whatsapp_conversation_id,
  status,
  created_at,
  updated_at
)
SELECT
  wc.tenant_id,
  wc.client_id,
  wc.client_name,
  wc.phone_number,
  wc.id,
  wc.status,
  wc.created_at,
  wc.updated_at
FROM whatsapp_conversations wc
WHERE NOT EXISTS (
  SELECT 1 FROM unified_conversations uc
  WHERE uc.whatsapp_conversation_id = wc.id
)
ON CONFLICT DO NOTHING;

-- Update stats for all migrated conversations
DO $$
DECLARE
  conv_id UUID;
BEGIN
  FOR conv_id IN SELECT id FROM unified_conversations
  LOOP
    PERFORM update_unified_conversation_stats(conv_id);
  END LOOP;
END $$;

-- ============================================
-- DONE
-- ============================================
