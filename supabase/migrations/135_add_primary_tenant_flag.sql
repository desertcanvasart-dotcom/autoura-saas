-- =====================================================================
-- Migration 135: Add Primary Tenant Flag
-- Description: Adds is_primary flag to tenants table to prevent tenant mismatches
-- Date: 2026-02-05
-- =====================================================================

-- =====================================================================
-- 1. ADD is_primary COLUMN TO tenants TABLE
-- =====================================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;

-- =====================================================================
-- 2. CREATE HELPER FUNCTION TO GET PRIMARY TENANT
-- =====================================================================

CREATE OR REPLACE FUNCTION get_primary_tenant_id()
RETURNS UUID AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- First try to get the primary tenant
  SELECT id INTO v_tenant_id
  FROM tenants
  WHERE is_primary = true
  LIMIT 1;

  -- If no primary tenant is set, fall back to first tenant (with warning)
  IF v_tenant_id IS NULL THEN
    SELECT id INTO v_tenant_id
    FROM tenants
    ORDER BY created_at ASC
    LIMIT 1;

    RAISE WARNING 'No primary tenant set! Falling back to oldest tenant: %. Consider setting a primary tenant.', v_tenant_id;
  END IF;

  RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 3. SET THE CURRENT ACTIVE TENANT AS PRIMARY
-- =====================================================================

DO $$
DECLARE
  v_tenant_id UUID := '9d5d4373-3e41-494b-bd19-c9750621b99a';
  v_updated_count INTEGER;
BEGIN
  -- First, ensure only one tenant is primary (reset all)
  UPDATE tenants SET is_primary = false WHERE is_primary = true;

  -- Set the specified tenant as primary
  UPDATE tenants
  SET is_primary = true
  WHERE id = v_tenant_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count > 0 THEN
    RAISE NOTICE 'Set tenant % as primary', v_tenant_id;
  ELSE
    RAISE WARNING 'Tenant % not found! No primary tenant set.', v_tenant_id;
  END IF;
END $$;

-- =====================================================================
-- 4. CREATE TRIGGER TO ENSURE ONLY ONE PRIMARY TENANT
-- =====================================================================

CREATE OR REPLACE FUNCTION ensure_single_primary_tenant()
RETURNS TRIGGER AS $$
BEGIN
  -- If setting a tenant as primary, unset all others
  IF NEW.is_primary = true THEN
    UPDATE tenants
    SET is_primary = false
    WHERE id != NEW.id AND is_primary = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_single_primary_tenant ON tenants;
CREATE TRIGGER trigger_single_primary_tenant
  BEFORE INSERT OR UPDATE OF is_primary ON tenants
  FOR EACH ROW
  WHEN (NEW.is_primary = true)
  EXECUTE FUNCTION ensure_single_primary_tenant();

-- =====================================================================
-- 5. ADD INDEX FOR FASTER LOOKUPS
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_tenants_is_primary ON tenants(is_primary) WHERE is_primary = true;

-- =====================================================================
-- 6. VERIFY
-- =====================================================================

DO $$
DECLARE
  v_primary_tenant_id UUID;
BEGIN
  SELECT id INTO v_primary_tenant_id
  FROM tenants
  WHERE is_primary = true;

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 135 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Primary tenant ID: %', v_primary_tenant_id;
  RAISE NOTICE '';
  RAISE NOTICE 'Usage in migrations:';
  RAISE NOTICE '  SELECT get_primary_tenant_id() INTO v_tenant_id;';
  RAISE NOTICE '';
  RAISE NOTICE 'Or use direct query:';
  RAISE NOTICE '  SELECT id FROM tenants WHERE is_primary = true;';
  RAISE NOTICE '';
END $$;
