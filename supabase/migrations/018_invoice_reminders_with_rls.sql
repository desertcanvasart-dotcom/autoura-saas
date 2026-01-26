-- =====================================================================
-- Migration 018: Invoice Reminders Table with Multi-Tenancy & RLS
-- Description: Creates invoice_reminders table for tracking payment reminder emails
-- Version: 1.0
-- Date: 2026-01-23
-- =====================================================================

-- =====================================================================
-- 1. CREATE INVOICE_REMINDERS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS invoice_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Relations
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

  -- Reminder details
  reminder_type VARCHAR(50) NOT NULL
    CHECK (reminder_type IN ('manual', 'before_due_7', 'before_due_3', 'on_due', 'overdue_7', 'overdue_14', 'overdue_30')),

  -- Email details
  recipient_email VARCHAR(255) NOT NULL,
  subject TEXT NOT NULL,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'failed', 'bounced')),
  error_message TEXT,

  -- Timestamps
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 2. CREATE INDEXES
-- =====================================================================

CREATE INDEX idx_invoice_reminders_tenant ON invoice_reminders(tenant_id);
CREATE INDEX idx_invoice_reminders_invoice ON invoice_reminders(invoice_id);
CREATE INDEX idx_invoice_reminders_status ON invoice_reminders(status);
CREATE INDEX idx_invoice_reminders_sent_at ON invoice_reminders(sent_at DESC);
CREATE INDEX idx_invoice_reminders_tenant_sent ON invoice_reminders(tenant_id, sent_at DESC);

-- =====================================================================
-- 3. ENABLE RLS
-- =====================================================================

ALTER TABLE invoice_reminders ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 4. CREATE RLS POLICIES
-- =====================================================================

-- Users can view their tenant's invoice reminders
DROP POLICY IF EXISTS "Users can view own tenant invoice reminders" ON invoice_reminders;
CREATE POLICY "Users can view own tenant invoice reminders"
  ON invoice_reminders FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Users can create invoice reminders in their tenant
DROP POLICY IF EXISTS "Users can insert own tenant invoice reminders" ON invoice_reminders;
CREATE POLICY "Users can insert own tenant invoice reminders"
  ON invoice_reminders FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Users can update their tenant's invoice reminders
DROP POLICY IF EXISTS "Users can update own tenant invoice reminders" ON invoice_reminders;
CREATE POLICY "Users can update own tenant invoice reminders"
  ON invoice_reminders FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

-- Managers+ can delete invoice reminders
DROP POLICY IF EXISTS "Managers can delete invoice reminders" ON invoice_reminders;
CREATE POLICY "Managers can delete invoice reminders"
  ON invoice_reminders FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND user_has_role('manager'));

-- =====================================================================
-- 5. AUTO-POPULATE TENANT_ID TRIGGER
-- =====================================================================

-- Trigger to auto-populate tenant_id from invoice
CREATE OR REPLACE FUNCTION auto_populate_invoice_reminder_tenant()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := (
      SELECT tenant_id
      FROM invoices
      WHERE id = NEW.invoice_id
      LIMIT 1
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_populate_invoice_reminder_tenant_trigger ON invoice_reminders;
CREATE TRIGGER auto_populate_invoice_reminder_tenant_trigger
  BEFORE INSERT ON invoice_reminders
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION auto_populate_invoice_reminder_tenant();

-- =====================================================================
-- 6. ADD REMINDER COLUMNS TO INVOICES (if not exists)
-- =====================================================================

DO $$
BEGIN
  -- Add last_reminder_sent if doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'invoices'
    AND column_name = 'last_reminder_sent'
  ) THEN
    ALTER TABLE invoices ADD COLUMN last_reminder_sent TIMESTAMPTZ;
    RAISE NOTICE 'Added last_reminder_sent column to invoices';
  END IF;

  -- Add reminder_count if doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'invoices'
    AND column_name = 'reminder_count'
  ) THEN
    ALTER TABLE invoices ADD COLUMN reminder_count INTEGER DEFAULT 0;
    RAISE NOTICE 'Added reminder_count column to invoices';
  END IF;

  -- Add next_reminder_date if doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'invoices'
    AND column_name = 'next_reminder_date'
  ) THEN
    ALTER TABLE invoices ADD COLUMN next_reminder_date DATE;
    RAISE NOTICE 'Added next_reminder_date column to invoices';
  END IF;

  -- Add reminder_paused if doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'invoices'
    AND column_name = 'reminder_paused'
  ) THEN
    ALTER TABLE invoices ADD COLUMN reminder_paused BOOLEAN DEFAULT false;
    RAISE NOTICE 'Added reminder_paused column to invoices';
  END IF;
END $$;

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'Migration 018 Complete!';
  RAISE NOTICE '✅ Table: invoice_reminders created with RLS';
  RAISE NOTICE '✅ Columns: tenant_id, invoice_id, reminder_type, status';
  RAISE NOTICE '✅ RLS: Enabled on invoice_reminders';
  RAISE NOTICE '✅ Policies: 4 RLS policies created (SELECT, INSERT, UPDATE, DELETE)';
  RAISE NOTICE '✅ Trigger: Auto-populate tenant_id from invoice';
  RAISE NOTICE '✅ Indexes: 5 indexes created for performance';
  RAISE NOTICE '✅ Invoices: Added reminder tracking columns';
  RAISE NOTICE '';
  RAISE NOTICE 'Security Status:';
  RAISE NOTICE '✅ Tenant isolation enforced via RLS';
  RAISE NOTICE '✅ Users can only access their tenant reminders';
  RAISE NOTICE '✅ Foreign key relationship with invoices secured';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Update reminder API routes to use createAuthenticatedClient()';
  RAISE NOTICE '2. Remove unauthenticated client usage';
  RAISE NOTICE '3. Test reminder functionality with RLS';
END $$;
