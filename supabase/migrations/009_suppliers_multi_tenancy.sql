-- =====================================================================
-- Migration 009: Add Multi-Tenancy to Suppliers
-- Description: Adds tenant_id and RLS to existing suppliers table
-- Version: 1.0
-- Date: 2026-01-23
-- =====================================================================

-- =====================================================================
-- 1. ADD TENANT_ID COLUMN (if not exists)
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    RAISE NOTICE '✅ Added tenant_id column to suppliers';
  ELSE
    RAISE NOTICE '⚠️  tenant_id column already exists on suppliers';
  END IF;
END $$;

-- =====================================================================
-- 2. SET DEFAULT TENANT FOR EXISTING DATA
-- =====================================================================

-- Set default tenant for any existing suppliers without tenant_id
UPDATE suppliers
SET tenant_id = (SELECT id FROM tenants LIMIT 1)
WHERE tenant_id IS NULL;

-- =====================================================================
-- 3. MAKE TENANT_ID REQUIRED
-- =====================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers'
    AND column_name = 'tenant_id'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE suppliers ALTER COLUMN tenant_id SET NOT NULL;
    RAISE NOTICE '✅ Made tenant_id NOT NULL on suppliers';
  END IF;
END $$;

-- =====================================================================
-- 4. CREATE INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_type_tenant ON suppliers(supplier_type, tenant_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_active_tenant ON suppliers(is_active, tenant_id);

-- =====================================================================
-- 5. ENSURE PARENT-CHILD RELATIONSHIPS ARE TENANT-SCOPED
-- =====================================================================

-- Drop old constraint if exists (in case it was created before)
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_parent_same_tenant_check;

-- Create trigger function to validate parent supplier is in same tenant
-- This prevents properties from linking to companies in other tenants
CREATE OR REPLACE FUNCTION validate_supplier_parent_tenant()
RETURNS TRIGGER AS $$
DECLARE
  parent_tenant_id UUID;
BEGIN
  -- If parent_supplier_id is NULL, no validation needed
  IF NEW.parent_supplier_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get parent supplier's tenant_id
  SELECT tenant_id INTO parent_tenant_id
  FROM suppliers
  WHERE id = NEW.parent_supplier_id;

  -- If parent not found, let foreign key constraint handle it
  IF parent_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Verify parent is in same tenant
  IF parent_tenant_id != NEW.tenant_id THEN
    RAISE EXCEPTION 'Parent supplier must be in the same tenant. Parent tenant: %, Current tenant: %',
      parent_tenant_id, NEW.tenant_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger (only if parent_supplier_id column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'parent_supplier_id'
  ) THEN
    DROP TRIGGER IF EXISTS validate_supplier_parent_tenant_trigger ON suppliers;
    CREATE TRIGGER validate_supplier_parent_tenant_trigger
      BEFORE INSERT OR UPDATE ON suppliers
      FOR EACH ROW
      EXECUTE FUNCTION validate_supplier_parent_tenant();
    RAISE NOTICE '✅ Added trigger: parent supplier must be in same tenant';
  ELSE
    RAISE NOTICE '⚠️  parent_supplier_id column does not exist yet (will be added in migration 010)';
  END IF;
END $$;

-- =====================================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- =====================================================================

-- Enable RLS
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- RLS POLICIES: SUPPLIERS
-- =====================================================================

-- Users can view suppliers from their tenant
DROP POLICY IF EXISTS "Users can view own tenant suppliers" ON suppliers;
CREATE POLICY "Users can view own tenant suppliers" ON suppliers
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Users can create suppliers in their tenant
DROP POLICY IF EXISTS "Users can create suppliers" ON suppliers;
CREATE POLICY "Users can create suppliers" ON suppliers
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Users can update suppliers in their tenant
DROP POLICY IF EXISTS "Users can update suppliers" ON suppliers;
CREATE POLICY "Users can update suppliers" ON suppliers
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

-- Users can delete suppliers in their tenant
DROP POLICY IF EXISTS "Users can delete suppliers" ON suppliers;
CREATE POLICY "Users can delete suppliers" ON suppliers
  FOR DELETE
  USING (tenant_id = get_user_tenant_id());

-- =====================================================================
-- 7. AUTO-POPULATE TRIGGER
-- =====================================================================

-- Auto-populate tenant_id for suppliers
DROP TRIGGER IF EXISTS auto_set_tenant_suppliers ON suppliers;
CREATE TRIGGER auto_set_tenant_suppliers
  BEFORE INSERT ON suppliers
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_tenant_id();

-- =====================================================================
-- 8. UPDATED_AT TRIGGER (if not exists)
-- =====================================================================

DROP TRIGGER IF EXISTS update_suppliers_updated_at ON suppliers;
CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- 9. VERIFICATION QUERIES (Run these after migration)
-- =====================================================================

-- To run after migration:
/*

-- Verify tenant_id column exists and is NOT NULL
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'suppliers'
AND column_name = 'tenant_id';

-- Verify all suppliers have tenant_id
SELECT COUNT(*) as suppliers_without_tenant
FROM suppliers
WHERE tenant_id IS NULL;
-- Expected: 0

-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'suppliers';

-- Verify policies exist
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'suppliers'
ORDER BY cmd;
-- Expected: 4 policies (SELECT, INSERT, UPDATE, DELETE)

-- Verify indexes
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename = 'suppliers'
AND indexname LIKE '%tenant%';

-- Verify parent-child relationships are tenant-scoped
-- This should return 0 (no cross-tenant relationships)
SELECT
  child.id as child_id,
  child.company_name as child_name,
  child.tenant_id as child_tenant,
  parent.id as parent_id,
  parent.company_name as parent_name,
  parent.tenant_id as parent_tenant
FROM suppliers child
LEFT JOIN suppliers parent ON child.parent_supplier_id = parent.id
WHERE child.parent_supplier_id IS NOT NULL
AND child.tenant_id != parent.tenant_id;
-- Expected: 0 rows

-- Verify triggers
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND event_object_table = 'suppliers';

*/

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'Migration 009 Complete!';
  RAISE NOTICE '✅ Added: tenant_id column to suppliers (NOT NULL)';
  RAISE NOTICE '✅ Created: indexes for tenant filtering';
  RAISE NOTICE '✅ Enabled: RLS on suppliers table';
  RAISE NOTICE '✅ Created: 4 RLS policies';
  RAISE NOTICE '✅ Created: Auto-populate trigger';
  RAISE NOTICE '✅ Created: updated_at trigger';
  RAISE NOTICE '✅ Added: Parent-child tenant constraint';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Run verification queries above';
  RAISE NOTICE '2. Update API routes (2 files) to use requireAuth()';
  RAISE NOTICE '3. Test hierarchical relationships are tenant-scoped';
  RAISE NOTICE '4. Test that properties can only link to parent companies in same tenant';
END $$;
