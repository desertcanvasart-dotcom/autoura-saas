-- =====================================================================
-- Migration 008: Add Multi-Tenancy to Team Members & Tasks
-- Description: Creates team_members and tasks tables with full multi-tenancy
-- Version: 1.0
-- Date: 2026-01-23
-- =====================================================================

-- =====================================================================
-- 1. TEAM MEMBERS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Personal info
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  role VARCHAR(50) DEFAULT 'staff'
    CHECK (role IN ('owner', 'manager', 'agent', 'staff', 'viewer')),

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Notes
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Email unique per tenant (can have same email in different tenants)
  UNIQUE(tenant_id, email)
);

-- Create indexes for team_members
CREATE INDEX IF NOT EXISTS idx_team_members_tenant ON team_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON team_members(email);
CREATE INDEX IF NOT EXISTS idx_team_members_active ON team_members(is_active);
CREATE INDEX IF NOT EXISTS idx_team_members_role ON team_members(role);

-- Apply updated_at trigger
DROP TRIGGER IF EXISTS update_team_members_updated_at ON team_members;
CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- 2. TASKS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Task details
  title VARCHAR(255) NOT NULL,
  description TEXT,
  due_date DATE,
  priority VARCHAR(20) DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status VARCHAR(20) DEFAULT 'todo'
    CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),

  -- Assignment (references team_members)
  assigned_to UUID REFERENCES team_members(id) ON DELETE SET NULL,

  -- Links to other entities
  linked_type VARCHAR(50), -- 'quote', 'itinerary', 'booking', 'client', etc.
  linked_id UUID,

  -- Metadata
  notes TEXT,
  completed_at TIMESTAMPTZ,
  archived BOOLEAN DEFAULT false,
  archived_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for tasks
CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_linked ON tasks(linked_type, linked_id);
CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived);

-- Apply updated_at trigger
DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- =====================================================================

-- Enable RLS
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- RLS POLICIES: TEAM MEMBERS
-- =====================================================================

-- Users can view members of their tenant
DROP POLICY IF EXISTS "Users can view own tenant team_members" ON team_members;
CREATE POLICY "Users can view own tenant team_members" ON team_members
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Users can create members in their tenant
DROP POLICY IF EXISTS "Users can create team_members" ON team_members;
CREATE POLICY "Users can create team_members" ON team_members
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Users can update members in their tenant
DROP POLICY IF EXISTS "Users can update team_members" ON team_members;
CREATE POLICY "Users can update team_members" ON team_members
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

-- Users can delete members in their tenant
DROP POLICY IF EXISTS "Users can delete team_members" ON team_members;
CREATE POLICY "Users can delete team_members" ON team_members
  FOR DELETE
  USING (tenant_id = get_user_tenant_id());

-- =====================================================================
-- RLS POLICIES: TASKS
-- =====================================================================

-- Users can view tasks from their tenant
DROP POLICY IF EXISTS "Users can view own tenant tasks" ON tasks;
CREATE POLICY "Users can view own tenant tasks" ON tasks
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Users can create tasks in their tenant
DROP POLICY IF EXISTS "Users can create tasks" ON tasks;
CREATE POLICY "Users can create tasks" ON tasks
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Users can update tasks in their tenant
DROP POLICY IF EXISTS "Users can update tasks" ON tasks;
CREATE POLICY "Users can update tasks" ON tasks
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

-- Users can delete tasks in their tenant
DROP POLICY IF EXISTS "Users can delete tasks" ON tasks;
CREATE POLICY "Users can delete tasks" ON tasks
  FOR DELETE
  USING (tenant_id = get_user_tenant_id());

-- =====================================================================
-- 4. AUTO-POPULATE TRIGGERS
-- =====================================================================

-- Auto-populate tenant_id for team_members
DROP TRIGGER IF EXISTS auto_set_tenant_team_members ON team_members;
CREATE TRIGGER auto_set_tenant_team_members
  BEFORE INSERT ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_tenant_id();

-- Auto-populate tenant_id for tasks
DROP TRIGGER IF EXISTS auto_set_tenant_tasks ON tasks;
CREATE TRIGGER auto_set_tenant_tasks
  BEFORE INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_tenant_id();

-- =====================================================================
-- 5. VERIFICATION QUERIES (Run these after migration)
-- =====================================================================

-- To run after migration:
/*

-- Verify tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('team_members', 'tasks');

-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('team_members', 'tasks');

-- Verify policies exist
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('team_members', 'tasks')
ORDER BY tablename, cmd;

-- Verify indexes
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('team_members', 'tasks')
ORDER BY tablename, indexname;

-- Verify triggers
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND event_object_table IN ('team_members', 'tasks');

*/

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'Migration 008 Complete!';
  RAISE NOTICE '✅ Created: team_members table with RLS';
  RAISE NOTICE '✅ Created: tasks table with RLS';
  RAISE NOTICE '✅ Enabled: RLS on both tables';
  RAISE NOTICE '✅ Created: 8 RLS policies (4 per table)';
  RAISE NOTICE '✅ Created: Auto-populate triggers';
  RAISE NOTICE '✅ Created: updated_at triggers';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Run verification queries above';
  RAISE NOTICE '2. Update API routes (6 files) to use requireAuth()';
  RAISE NOTICE '3. Test tenant isolation with 2 test users';
END $$;
