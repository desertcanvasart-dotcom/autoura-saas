-- ============================================
-- MIGRATION 023: ADD SCHEDULED SENDS TABLE
-- ============================================
-- Adds support for scheduling template sends
-- Created: 2026-01-25
-- ============================================

-- Create scheduled_sends table
CREATE TABLE IF NOT EXISTS scheduled_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES message_templates(id) ON DELETE CASCADE,

  -- Recipient info
  recipient_type VARCHAR(50) NOT NULL, -- 'client', 'hotel', 'cruise', 'transport', 'guide'
  recipient_id UUID NOT NULL,
  recipient_contact VARCHAR(255) NOT NULL, -- email or phone

  -- Message details
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms')),
  subject TEXT,
  body TEXT NOT NULL,

  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(50) DEFAULT 'UTC',

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),

  -- Execution tracking
  sent_at TIMESTAMPTZ,
  error_message TEXT,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE scheduled_sends ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own tenant scheduled sends"
  ON scheduled_sends FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can create scheduled sends for own tenant"
  ON scheduled_sends FOR INSERT
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update own tenant scheduled sends"
  ON scheduled_sends FOR UPDATE
  USING (tenant_id IN (
    SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own tenant scheduled sends"
  ON scheduled_sends FOR DELETE
  USING (tenant_id IN (
    SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
  ));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_sends_tenant ON scheduled_sends(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_sends_status ON scheduled_sends(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_sends_scheduled_for ON scheduled_sends(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_sends_pending ON scheduled_sends(status, scheduled_for)
  WHERE status = 'pending';

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'scheduled_sends'
  ) THEN
    RAISE NOTICE '✅ Migration 023 completed: scheduled_sends table created';
  ELSE
    RAISE WARNING '⚠️ Migration 023 may be incomplete';
  END IF;
END $$;
