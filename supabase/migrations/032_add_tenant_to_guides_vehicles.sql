-- =====================================================
-- Migration 032: Add Tenant Isolation to Guides & Vehicles
-- =====================================================
-- Adds tenant_id to guides and vehicles tables
-- Enables RLS for proper multi-tenancy

-- =====================================================
-- 1. GUIDES TABLE - Add Tenant Isolation
-- =====================================================

-- Add tenant_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'guides' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE guides ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Set tenant_id for existing guides (use first tenant as default)
UPDATE guides
SET tenant_id = (SELECT id FROM tenants LIMIT 1)
WHERE tenant_id IS NULL;

-- Make tenant_id required
ALTER TABLE guides ALTER COLUMN tenant_id SET NOT NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_guides_tenant ON guides(tenant_id);

-- Enable RLS
ALTER TABLE guides ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view their tenant guides" ON guides;
DROP POLICY IF EXISTS "Users can insert guides for their tenant" ON guides;
DROP POLICY IF EXISTS "Users can update their tenant guides" ON guides;
DROP POLICY IF EXISTS "Users can delete their tenant guides" ON guides;

-- RLS Policies for guides
CREATE POLICY "Users can view their tenant guides" ON guides
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can insert guides for their tenant" ON guides
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can update their tenant guides" ON guides
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can delete their tenant guides" ON guides
  FOR DELETE
  USING (
    tenant_id = get_user_tenant_id() AND
    user_has_role(ARRAY['owner', 'admin', 'manager'])
  );

-- =====================================================
-- 2. VEHICLES TABLE - Add Tenant Isolation
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vehicles') THEN
    -- Add tenant_id column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'vehicles' AND column_name = 'tenant_id'
    ) THEN
      ALTER TABLE vehicles ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;

    -- Set tenant_id for existing vehicles (use first tenant as default)
    UPDATE vehicles
    SET tenant_id = (SELECT id FROM tenants LIMIT 1)
    WHERE tenant_id IS NULL;

    -- Make tenant_id required
    ALTER TABLE vehicles ALTER COLUMN tenant_id SET NOT NULL;

    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_vehicles_tenant ON vehicles(tenant_id);

    -- Enable RLS
    ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

    -- Drop existing policies if any
    DROP POLICY IF EXISTS "Users can view their tenant vehicles" ON vehicles;
    DROP POLICY IF EXISTS "Users can insert vehicles for their tenant" ON vehicles;
    DROP POLICY IF EXISTS "Users can update their tenant vehicles" ON vehicles;
    DROP POLICY IF EXISTS "Users can delete their tenant vehicles" ON vehicles;

    -- RLS Policies for vehicles
    EXECUTE 'CREATE POLICY "Users can view their tenant vehicles" ON vehicles
      FOR SELECT
      USING (tenant_id = get_user_tenant_id())';

    EXECUTE 'CREATE POLICY "Users can insert vehicles for their tenant" ON vehicles
      FOR INSERT
      WITH CHECK (tenant_id = get_user_tenant_id())';

    EXECUTE 'CREATE POLICY "Users can update their tenant vehicles" ON vehicles
      FOR UPDATE
      USING (tenant_id = get_user_tenant_id())';

    EXECUTE 'CREATE POLICY "Users can delete their tenant vehicles" ON vehicles
      FOR DELETE
      USING (
        tenant_id = get_user_tenant_id() AND
        user_has_role(ARRAY[''owner'', ''admin'', ''manager''])
      )';
  END IF;
END $$;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

COMMENT ON TABLE guides IS 'Tour guides directory - tenant-scoped with RLS';
COMMENT ON COLUMN guides.tenant_id IS 'Tenant that owns this guide';
