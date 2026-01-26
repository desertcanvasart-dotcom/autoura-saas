-- =====================================================================
-- Migration 035: Create client_followups Table with Multi-Tenancy
-- Date: 2026-01-23
-- Description: Creates client followups/reminders table for tracking client communications
-- =====================================================================

CREATE TABLE IF NOT EXISTS client_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Followup details
  description TEXT NOT NULL,
  due_date TIMESTAMPTZ NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high')),

  -- Optional fields
  notes TEXT,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'cancelled', 'overdue')),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- =====================================================================
-- INDEXES
-- =====================================================================

CREATE INDEX idx_client_followups_tenant ON client_followups(tenant_id);
CREATE INDEX idx_client_followups_client ON client_followups(client_id);
CREATE INDEX idx_client_followups_due_date ON client_followups(due_date);
CREATE INDEX idx_client_followups_status ON client_followups(status);
CREATE INDEX idx_client_followups_priority ON client_followups(priority);
CREATE INDEX idx_client_followups_assigned ON client_followups(assigned_to);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================

ALTER TABLE client_followups ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can view their tenant's followups
CREATE POLICY "Users can view their tenant's followups"
  ON client_followups FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- INSERT: Users can create followups for their tenant
CREATE POLICY "Users can create followups for their tenant"
  ON client_followups FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- UPDATE: Users can update their tenant's followups
CREATE POLICY "Users can update their tenant's followups"
  ON client_followups FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

-- DELETE: Managers can delete followups
CREATE POLICY "Managers can delete their tenant's followups"
  ON client_followups FOR DELETE
  USING (
    tenant_id = get_user_tenant_id()
    AND user_has_role('manager')
  );

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- Auto-update timestamp trigger
CREATE TRIGGER update_client_followups_updated_at
  BEFORE UPDATE ON client_followups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-mark overdue followups (optional - can be done via cron job instead)
CREATE OR REPLACE FUNCTION mark_overdue_followups()
RETURNS void AS $$
BEGIN
  UPDATE client_followups
  SET status = 'overdue'
  WHERE status = 'pending'
    AND due_date < NOW()
    AND status != 'overdue';
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- COMMENTS
-- =====================================================================

COMMENT ON TABLE client_followups IS 'Client follow-up reminders and tasks with multi-tenancy support';
COMMENT ON COLUMN client_followups.tenant_id IS 'Tenant isolation - required for multi-tenancy';
COMMENT ON COLUMN client_followups.client_id IS 'Reference to the client this followup is for';
COMMENT ON COLUMN client_followups.priority IS 'Priority level: low, medium, high';
COMMENT ON COLUMN client_followups.status IS 'Followup status: pending, completed, cancelled, overdue';
COMMENT ON COLUMN client_followups.assigned_to IS 'User assigned to handle this followup';

-- =====================================================================
-- SUMMARY
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '====================================';
  RAISE NOTICE 'Migration 035 Complete';
  RAISE NOTICE '====================================';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Created: client_followups table';
  RAISE NOTICE '✅ Added: tenant_id column with FK constraint';
  RAISE NOTICE '✅ Created: 6 performance indexes';
  RAISE NOTICE '✅ Enabled: Row Level Security (RLS)';
  RAISE NOTICE '✅ Created: 4 RLS policies';
  RAISE NOTICE '✅ Added: Auto-update timestamp trigger';
  RAISE NOTICE '✅ Added: mark_overdue_followups() helper function';
  RAISE NOTICE '';
  RAISE NOTICE 'Features:';
  RAISE NOTICE '  • Client follow-up tracking';
  RAISE NOTICE '  • Priority levels (low, medium, high)';
  RAISE NOTICE '  • Status tracking (pending, completed, cancelled, overdue)';
  RAISE NOTICE '  • User assignment';
  RAISE NOTICE '  • Automatic overdue detection';
  RAISE NOTICE '';
  RAISE NOTICE 'Security features:';
  RAISE NOTICE '  • Tenant isolation via tenant_id';
  RAISE NOTICE '  • RLS policies filter by tenant automatically';
  RAISE NOTICE '  • Manager role required for deletion';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Uncomment followup queries in app/dashboard/page.tsx';
  RAISE NOTICE '  2. Test dashboard followups section';
  RAISE NOTICE '  3. (Optional) Set up cron job to call mark_overdue_followups()';
  RAISE NOTICE '';
END $$;
