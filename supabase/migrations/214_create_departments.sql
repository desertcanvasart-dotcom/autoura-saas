-- =====================================================================
-- Migration 214: Create departments + assign to team_members / tasks
-- Description: Operational departments (Reservation, Aviation, Execution,
--              Accounting) mapped to service types. Tenant-scoped following
--              the tipping_rates / fixed_daily_costs pattern (NULL tenant_id
--              = global default seeded here; tenants may add their own).
-- Date: 2026-06-22
-- =====================================================================

-- =====================================================================
-- 1. TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,
  description TEXT,
  service_types TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, name)
);

-- =====================================================================
-- 2. INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_departments_tenant ON departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_departments_is_active ON departments(is_active);

-- =====================================================================
-- 3. ROW LEVEL SECURITY (tenant isolation + global NULL-tenant defaults)
-- =====================================================================

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY departments_tenant_isolation ON departments
  FOR ALL
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());

CREATE POLICY departments_service_role ON departments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================================
-- 4. UPDATED_AT TRIGGER
-- =====================================================================

CREATE OR REPLACE FUNCTION update_departments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_departments_updated_at ON departments;
CREATE TRIGGER trigger_departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW
  EXECUTE FUNCTION update_departments_updated_at();

-- =====================================================================
-- 5. SEED — 4 global (NULL-tenant) departments. Idempotent.
--    (UNIQUE(tenant_id, name) treats NULL tenant_ids as distinct, so guard
--     with NOT EXISTS rather than ON CONFLICT.)
-- =====================================================================

INSERT INTO departments (tenant_id, name, description, service_types)
SELECT NULL, d.name, d.description, d.service_types
FROM (VALUES
  ('Reservation', 'Hotels, cruises, restaurants, vehicles & transport', ARRAY['accommodation','cruise','meal','transportation']::text[]),
  ('Aviation',    'Flight ticket bookings',                              ARRAY['flight']::text[]),
  ('Execution',   'Guides, entrance tickets, airport services, hotel porterage', ARRAY['guide','entrance','airport_service','hotel_service']::text[]),
  ('Accounting',  'Invoices, payments, commissions',                     ARRAY['invoice','payment','commission']::text[])
) AS d(name, description, service_types)
WHERE NOT EXISTS (
  SELECT 1 FROM departments x WHERE x.tenant_id IS NULL AND x.name = d.name
);

-- =====================================================================
-- 6. ASSIGNMENT COLUMNS on team_members + tasks
-- =====================================================================

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE tasks        ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_team_members_department ON team_members(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_department ON tasks(department_id) WHERE department_id IS NOT NULL;

DO $$
BEGIN
  RAISE NOTICE 'Migration 214 complete — departments table + department_id on team_members/tasks';
END $$;
