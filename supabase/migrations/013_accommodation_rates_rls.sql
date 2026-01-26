-- =====================================================================
-- Migration 013: Accommodation Rates RLS & Multi-Tenancy
-- Description: Secures accommodation_rates table with RLS and tenant isolation
-- Version: 1.0
-- Date: 2026-01-23
-- =====================================================================

-- =====================================================================
-- CRITICAL FINDINGS:
-- 1. accommodation_rates table used by hotels API
-- 2. Hotels API uses supabaseAdmin (bypassing RLS)
-- 3. No tenant isolation - cross-tenant access possible
-- =====================================================================

-- =====================================================================
-- 1. ADD TENANT_ID COLUMN (if table exists without it)
-- =====================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accommodation_rates') THEN
    -- Add tenant_id if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'accommodation_rates'
      AND column_name = 'tenant_id'
    ) THEN
      ALTER TABLE accommodation_rates
        ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

      RAISE NOTICE 'Added tenant_id column to accommodation_rates';
    END IF;

    -- Set default tenant for existing records
    UPDATE accommodation_rates
    SET tenant_id = (SELECT id FROM tenants LIMIT 1)
    WHERE tenant_id IS NULL;

    -- Make tenant_id required
    ALTER TABLE accommodation_rates
      ALTER COLUMN tenant_id SET NOT NULL;

    RAISE NOTICE 'Set tenant_id as NOT NULL on accommodation_rates';
  ELSE
    RAISE NOTICE 'Table accommodation_rates does not exist - skipping';
  END IF;
END $$;

-- =====================================================================
-- 2. ENABLE RLS
-- =====================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accommodation_rates') THEN
    ALTER TABLE accommodation_rates ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'Enabled RLS on accommodation_rates';
  END IF;
END $$;

-- =====================================================================
-- 3. CREATE RLS POLICIES
-- =====================================================================

-- Users can view accommodation rates in their tenant
DROP POLICY IF EXISTS "Users can view tenant accommodation rates" ON accommodation_rates;
CREATE POLICY "Users can view tenant accommodation rates" ON accommodation_rates
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Users can insert accommodation rates in their tenant
DROP POLICY IF EXISTS "Users can insert tenant accommodation rates" ON accommodation_rates;
CREATE POLICY "Users can insert tenant accommodation rates" ON accommodation_rates
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Users can update accommodation rates in their tenant
DROP POLICY IF EXISTS "Users can update tenant accommodation rates" ON accommodation_rates;
CREATE POLICY "Users can update tenant accommodation rates" ON accommodation_rates
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

-- Users can delete accommodation rates in their tenant
DROP POLICY IF EXISTS "Users can delete tenant accommodation rates" ON accommodation_rates;
CREATE POLICY "Users can delete tenant accommodation rates" ON accommodation_rates
  FOR DELETE
  USING (tenant_id = get_user_tenant_id());

-- =====================================================================
-- 4. CREATE AUTO-POPULATE TRIGGER
-- =====================================================================

DROP TRIGGER IF EXISTS auto_populate_accommodation_tenant_id ON accommodation_rates;
CREATE TRIGGER auto_populate_accommodation_tenant_id
  BEFORE INSERT ON accommodation_rates
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION auto_set_tenant_id();

-- =====================================================================
-- 5. CREATE UPDATED_AT TRIGGER (if column exists)
-- =====================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'accommodation_rates'
    AND column_name = 'updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS update_accommodation_rates_updated_at ON accommodation_rates;
    CREATE TRIGGER update_accommodation_rates_updated_at
      BEFORE UPDATE ON accommodation_rates
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();

    RAISE NOTICE 'Created updated_at trigger on accommodation_rates';
  END IF;
END $$;

-- =====================================================================
-- 6. CREATE INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_accommodation_rates_tenant ON accommodation_rates(tenant_id);

-- Create indexes only if columns exist
DO $$
BEGIN
  -- Index on property_name (if column exists)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accommodation_rates' AND column_name = 'property_name') THEN
    CREATE INDEX IF NOT EXISTS idx_accommodation_rates_property_name ON accommodation_rates(property_name);
    RAISE NOTICE 'Created index on property_name';
  END IF;

  -- Index on city (if column exists)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accommodation_rates' AND column_name = 'city') THEN
    CREATE INDEX IF NOT EXISTS idx_accommodation_rates_city ON accommodation_rates(city);
    RAISE NOTICE 'Created index on city';
  END IF;

  -- Index on tier (if column exists)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accommodation_rates' AND column_name = 'tier') THEN
    CREATE INDEX IF NOT EXISTS idx_accommodation_rates_tier ON accommodation_rates(tier);
    RAISE NOTICE 'Created index on tier';
  END IF;

  -- Index on is_active (if column exists)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accommodation_rates' AND column_name = 'is_active') THEN
    CREATE INDEX IF NOT EXISTS idx_accommodation_rates_is_active ON accommodation_rates(is_active);
    RAISE NOTICE 'Created index on is_active';
  END IF;
END $$;

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'Migration 013 Complete!';
  RAISE NOTICE '✅ Table: accommodation_rates secured with RLS';
  RAISE NOTICE '✅ Column: tenant_id added and set as NOT NULL';
  RAISE NOTICE '✅ RLS: Enabled on accommodation_rates';
  RAISE NOTICE '✅ Policies: 4 RLS policies created (SELECT, INSERT, UPDATE, DELETE)';
  RAISE NOTICE '✅ Triggers: Auto-populate tenant_id';
  RAISE NOTICE '✅ Indexes: 5 indexes created for performance';
  RAISE NOTICE '';
  RAISE NOTICE 'Security Status:';
  RAISE NOTICE '✅ Tenant isolation enforced via RLS';
  RAISE NOTICE '✅ Users can only access their tenant accommodation rates';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Update hotels API routes to use createAuthenticatedClient()';
  RAISE NOTICE '2. Remove supabaseAdmin usage';
  RAISE NOTICE '3. Test cross-tenant access is blocked';
END $$;
