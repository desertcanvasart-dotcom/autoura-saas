-- =====================================================================
-- Migration 012: Restaurant Contacts RLS & Multi-Tenancy
-- Description: Secures restaurant_contacts table with RLS and tenant isolation
-- Version: 1.0
-- Date: 2026-01-23
-- =====================================================================

-- =====================================================================
-- CRITICAL FINDINGS:
-- 1. restaurant_contacts table exists but may not have tenant_id
-- 2. RLS may not be enabled (cross-tenant access possible)
-- 3. API routes use supabaseAdmin (bypassing RLS) - to be fixed separately
-- =====================================================================

-- =====================================================================
-- 1. CREATE TABLE IF NOT EXISTS
-- =====================================================================

CREATE TABLE IF NOT EXISTS restaurant_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- Basic Information
  name VARCHAR(255) NOT NULL,
  restaurant_type VARCHAR(50) DEFAULT 'local',
  cuisine_type VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  address TEXT,

  -- Contact Information
  contact_person VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  whatsapp VARCHAR(50),
  capacity INTEGER,

  -- Service Details
  meal_types TEXT[], -- ['Breakfast', 'Lunch', 'Dinner', etc.]
  dietary_options TEXT[], -- ['Vegetarian', 'Vegan', 'Halal', etc.]
  notes TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  tier VARCHAR(20) DEFAULT 'standard' CHECK (tier IN ('budget', 'standard', 'deluxe', 'luxury')),
  is_preferred BOOLEAN DEFAULT false,

  -- Rates - EUR Passport Holders
  rate_per_person_eur DECIMAL(10,2),
  rate_breakfast_eur DECIMAL(10,2),
  rate_lunch_eur DECIMAL(10,2),
  rate_dinner_eur DECIMAL(10,2),

  -- Rates - Non-EUR Passport Holders
  rate_per_person_non_eur DECIMAL(10,2),
  rate_breakfast_non_eur DECIMAL(10,2),
  rate_lunch_non_eur DECIMAL(10,2),
  rate_dinner_non_eur DECIMAL(10,2),

  -- Inclusions
  drinks_included BOOLEAN DEFAULT false,
  tip_included BOOLEAN DEFAULT false,

  -- Discounts
  child_discount_percent DECIMAL(5,2) DEFAULT 50.00,
  group_discount_percent DECIMAL(5,2),
  group_min_size INTEGER DEFAULT 10,

  -- Rate Validity
  rate_valid_from DATE,
  rate_valid_to DATE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 2. ADD TENANT_ID COLUMN (if table already exists without it)
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'restaurant_contacts'
    AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE restaurant_contacts
      ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

    RAISE NOTICE 'Added tenant_id column to restaurant_contacts';
  END IF;
END $$;

-- =====================================================================
-- 3. SET DEFAULT TENANT FOR EXISTING RECORDS
-- =====================================================================

UPDATE restaurant_contacts
SET tenant_id = (SELECT id FROM tenants LIMIT 1)
WHERE tenant_id IS NULL;

-- =====================================================================
-- 4. MAKE TENANT_ID REQUIRED
-- =====================================================================

ALTER TABLE restaurant_contacts
  ALTER COLUMN tenant_id SET NOT NULL;

-- =====================================================================
-- 5. ENABLE RLS
-- =====================================================================

ALTER TABLE restaurant_contacts ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 6. CREATE RLS POLICIES
-- =====================================================================

-- Users can view restaurants in their tenant
DROP POLICY IF EXISTS "Users can view tenant restaurants" ON restaurant_contacts;
CREATE POLICY "Users can view tenant restaurants" ON restaurant_contacts
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Users can insert restaurants in their tenant
DROP POLICY IF EXISTS "Users can insert tenant restaurants" ON restaurant_contacts;
CREATE POLICY "Users can insert tenant restaurants" ON restaurant_contacts
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Users can update restaurants in their tenant
DROP POLICY IF EXISTS "Users can update tenant restaurants" ON restaurant_contacts;
CREATE POLICY "Users can update tenant restaurants" ON restaurant_contacts
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

-- Users can delete restaurants in their tenant
DROP POLICY IF EXISTS "Users can delete tenant restaurants" ON restaurant_contacts;
CREATE POLICY "Users can delete tenant restaurants" ON restaurant_contacts
  FOR DELETE
  USING (tenant_id = get_user_tenant_id());

-- =====================================================================
-- 7. CREATE AUTO-POPULATE TRIGGER
-- =====================================================================

DROP TRIGGER IF EXISTS auto_populate_restaurant_tenant_id ON restaurant_contacts;
CREATE TRIGGER auto_populate_restaurant_tenant_id
  BEFORE INSERT ON restaurant_contacts
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION auto_set_tenant_id();

-- =====================================================================
-- 8. CREATE UPDATED_AT TRIGGER
-- =====================================================================

DROP TRIGGER IF EXISTS update_restaurant_contacts_updated_at ON restaurant_contacts;
CREATE TRIGGER update_restaurant_contacts_updated_at
  BEFORE UPDATE ON restaurant_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- 9. CREATE INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_restaurant_contacts_tenant ON restaurant_contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_contacts_city ON restaurant_contacts(city);
CREATE INDEX IF NOT EXISTS idx_restaurant_contacts_tier ON restaurant_contacts(tier);
CREATE INDEX IF NOT EXISTS idx_restaurant_contacts_is_active ON restaurant_contacts(is_active);
CREATE INDEX IF NOT EXISTS idx_restaurant_contacts_is_preferred ON restaurant_contacts(is_preferred, tier);

-- =====================================================================
-- 10. VERIFICATION QUERIES (Run these after migration)
-- =====================================================================

-- To run after migration:
/*

-- Verify table exists and has tenant_id
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'restaurant_contacts'
ORDER BY ordinal_position;

-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'restaurant_contacts';

-- Verify policies exist
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'restaurant_contacts'
ORDER BY cmd;

-- Verify triggers exist
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
AND event_object_table = 'restaurant_contacts';

-- Verify indexes
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename = 'restaurant_contacts'
ORDER BY indexname;

*/

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'Migration 012 Complete!';
  RAISE NOTICE '✅ Table: restaurant_contacts created/updated';
  RAISE NOTICE '✅ Column: tenant_id added (if missing) and set as NOT NULL';
  RAISE NOTICE '✅ RLS: Enabled on restaurant_contacts';
  RAISE NOTICE '✅ Policies: 4 RLS policies created (SELECT, INSERT, UPDATE, DELETE)';
  RAISE NOTICE '✅ Triggers: Auto-populate tenant_id + updated_at';
  RAISE NOTICE '✅ Indexes: 5 indexes created for performance';
  RAISE NOTICE '';
  RAISE NOTICE 'Security Status:';
  RAISE NOTICE '✅ Tenant isolation enforced via RLS';
  RAISE NOTICE '✅ Users can only access their tenant restaurants';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Run verification queries above';
  RAISE NOTICE '2. Update API routes to use createAuthenticatedClient()';
  RAISE NOTICE '3. Fix route.ts to query restaurant_contacts (not meal_rates)';
  RAISE NOTICE '4. Test cross-tenant access is blocked';
END $$;
