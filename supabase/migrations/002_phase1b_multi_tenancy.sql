-- =====================================================================
-- Autoura Phase 1B: Full Multi-Tenancy Migration
-- Description: Adds tenant members, features, RLS policies
-- Version: 1.0
-- Date: 2026-01-22
-- =====================================================================

-- =====================================================================
-- 1. TENANT MEMBERS TABLE (User-Tenant Relationships)
-- =====================================================================

CREATE TABLE IF NOT EXISTS tenant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Role & Permissions
  role VARCHAR(20) NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'manager', 'member', 'viewer')),

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'invited', 'suspended')),

  -- Invitation tracking
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One user can only be in one tenant once
  UNIQUE(tenant_id, user_id)
);

-- Create indexes for tenant_members
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant ON tenant_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_role ON tenant_members(role);
CREATE INDEX IF NOT EXISTS idx_tenant_members_status ON tenant_members(status);

-- Apply updated_at trigger
DROP TRIGGER IF EXISTS update_tenant_members_updated_at ON tenant_members;
CREATE TRIGGER update_tenant_members_updated_at
  BEFORE UPDATE ON tenant_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- 2. TENANT FEATURES TABLE (Feature Flags & Settings)
-- =====================================================================

CREATE TABLE IF NOT EXISTS tenant_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Feature toggles
  b2c_enabled BOOLEAN NOT NULL DEFAULT true,
  b2b_enabled BOOLEAN NOT NULL DEFAULT true,
  whatsapp_integration BOOLEAN NOT NULL DEFAULT true,
  email_integration BOOLEAN NOT NULL DEFAULT true,
  pdf_generation BOOLEAN NOT NULL DEFAULT true,
  analytics_enabled BOOLEAN NOT NULL DEFAULT true,

  -- Limits
  max_users INTEGER NOT NULL DEFAULT 10,
  max_quotes_per_month INTEGER NOT NULL DEFAULT 1000,
  max_partners INTEGER NOT NULL DEFAULT 100,

  -- Branding
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#3B82F6',
  secondary_color VARCHAR(7) DEFAULT '#10B981',

  -- Settings (JSONB for flexibility)
  custom_settings JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One feature record per tenant
  UNIQUE(tenant_id)
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_tenant_features_tenant ON tenant_features(tenant_id);

-- Apply updated_at trigger
DROP TRIGGER IF EXISTS update_tenant_features_updated_at ON tenant_features;
CREATE TRIGGER update_tenant_features_updated_at
  BEFORE UPDATE ON tenant_features
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default features for existing tenant
INSERT INTO tenant_features (tenant_id)
SELECT id FROM tenants
WHERE id NOT IN (SELECT tenant_id FROM tenant_features)
ON CONFLICT (tenant_id) DO NOTHING;

-- =====================================================================
-- 3. ADD TENANT_ID TO REMAINING TABLES
-- =====================================================================

-- Add tenant_id to clients table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE clients ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
END $$;

-- Set default tenant for existing clients
UPDATE clients
SET tenant_id = (SELECT id FROM tenants LIMIT 1)
WHERE tenant_id IS NULL;

-- Make tenant_id required on clients
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients'
    AND column_name = 'tenant_id'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE clients ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;

-- Create index
CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);

-- =====================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2c_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- Helper function: Get user's tenant_id
-- =====================================================================

CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT tenant_id
    FROM tenant_members
    WHERE user_id = auth.uid()
    AND status = 'active'
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- Helper function: Check if user has role in tenant
-- =====================================================================

CREATE OR REPLACE FUNCTION user_has_role(required_role VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM tenant_members
    WHERE user_id = auth.uid()
    AND tenant_id = get_user_tenant_id()
    AND status = 'active'
    AND (
      role = required_role
      OR role = 'owner'  -- Owners have all permissions
      OR role = 'admin'  -- Admins have all permissions
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- RLS POLICIES: TENANTS
-- =====================================================================

-- Users can see their own tenant
DROP POLICY IF EXISTS "Users can view own tenant" ON tenants;
CREATE POLICY "Users can view own tenant" ON tenants
  FOR SELECT
  USING (id = get_user_tenant_id());

-- Only owners/admins can update tenant
DROP POLICY IF EXISTS "Owners/admins can update tenant" ON tenants;
CREATE POLICY "Owners/admins can update tenant" ON tenants
  FOR UPDATE
  USING (id = get_user_tenant_id() AND user_has_role('admin'));

-- =====================================================================
-- RLS POLICIES: TENANT MEMBERS
-- =====================================================================

-- Users can see members of their tenant
DROP POLICY IF EXISTS "Users can view tenant members" ON tenant_members;
CREATE POLICY "Users can view tenant members" ON tenant_members
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Admins can manage members
DROP POLICY IF EXISTS "Admins can manage members" ON tenant_members;
CREATE POLICY "Admins can manage members" ON tenant_members
  FOR ALL
  USING (tenant_id = get_user_tenant_id() AND user_has_role('admin'));

-- =====================================================================
-- RLS POLICIES: TENANT FEATURES
-- =====================================================================

-- Users can view their tenant features
DROP POLICY IF EXISTS "Users can view tenant features" ON tenant_features;
CREATE POLICY "Users can view tenant features" ON tenant_features
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Only owners/admins can update features
DROP POLICY IF EXISTS "Owners/admins can update features" ON tenant_features;
CREATE POLICY "Owners/admins can update features" ON tenant_features
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND user_has_role('admin'));

-- =====================================================================
-- RLS POLICIES: B2C QUOTES
-- =====================================================================

-- Users can view quotes from their tenant
DROP POLICY IF EXISTS "Users can view tenant b2c quotes" ON b2c_quotes;
CREATE POLICY "Users can view tenant b2c quotes" ON b2c_quotes
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Users can create quotes in their tenant
DROP POLICY IF EXISTS "Users can create b2c quotes" ON b2c_quotes;
CREATE POLICY "Users can create b2c quotes" ON b2c_quotes
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Users can update quotes in their tenant
DROP POLICY IF EXISTS "Users can update b2c quotes" ON b2c_quotes;
CREATE POLICY "Users can update b2c quotes" ON b2c_quotes
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

-- Only managers+ can delete quotes
DROP POLICY IF EXISTS "Managers can delete b2c quotes" ON b2c_quotes;
CREATE POLICY "Managers can delete b2c quotes" ON b2c_quotes
  FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND user_has_role('manager'));

-- =====================================================================
-- RLS POLICIES: B2B QUOTES
-- =====================================================================

-- Users can view quotes from their tenant
DROP POLICY IF EXISTS "Users can view tenant b2b quotes" ON b2b_quotes;
CREATE POLICY "Users can view tenant b2b quotes" ON b2b_quotes
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Users can create quotes in their tenant
DROP POLICY IF EXISTS "Users can create b2b quotes" ON b2b_quotes;
CREATE POLICY "Users can create b2b quotes" ON b2b_quotes
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Users can update quotes in their tenant
DROP POLICY IF EXISTS "Users can update b2b quotes" ON b2b_quotes;
CREATE POLICY "Users can update b2b quotes" ON b2b_quotes
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

-- Only managers+ can delete quotes
DROP POLICY IF EXISTS "Managers can delete b2b quotes" ON b2b_quotes;
CREATE POLICY "Managers can delete b2b quotes" ON b2b_quotes
  FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND user_has_role('manager'));

-- =====================================================================
-- RLS POLICIES: ITINERARIES
-- =====================================================================

-- Users can view itineraries from their tenant
DROP POLICY IF EXISTS "Users can view tenant itineraries" ON itineraries;
CREATE POLICY "Users can view tenant itineraries" ON itineraries
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Users can create itineraries in their tenant
DROP POLICY IF EXISTS "Users can create itineraries" ON itineraries;
CREATE POLICY "Users can create itineraries" ON itineraries
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Users can update itineraries in their tenant
DROP POLICY IF EXISTS "Users can update itineraries" ON itineraries;
CREATE POLICY "Users can update itineraries" ON itineraries
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

-- Only managers+ can delete itineraries
DROP POLICY IF EXISTS "Managers can delete itineraries" ON itineraries;
CREATE POLICY "Managers can delete itineraries" ON itineraries
  FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND user_has_role('manager'));

-- =====================================================================
-- RLS POLICIES: B2B PARTNERS
-- =====================================================================

-- Users can view partners from their tenant
DROP POLICY IF EXISTS "Users can view tenant partners" ON b2b_partners;
CREATE POLICY "Users can view tenant partners" ON b2b_partners
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Users can create partners in their tenant
DROP POLICY IF EXISTS "Users can create partners" ON b2b_partners;
CREATE POLICY "Users can create partners" ON b2b_partners
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Users can update partners in their tenant
DROP POLICY IF EXISTS "Users can update partners" ON b2b_partners;
CREATE POLICY "Users can update partners" ON b2b_partners
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

-- Only managers+ can delete partners
DROP POLICY IF EXISTS "Managers can delete partners" ON b2b_partners;
CREATE POLICY "Managers can delete partners" ON b2b_partners
  FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND user_has_role('manager'));

-- =====================================================================
-- RLS POLICIES: CLIENTS
-- =====================================================================

-- Users can view clients from their tenant
DROP POLICY IF EXISTS "Users can view tenant clients" ON clients;
CREATE POLICY "Users can view tenant clients" ON clients
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Users can create clients in their tenant
DROP POLICY IF EXISTS "Users can create clients" ON clients;
CREATE POLICY "Users can create clients" ON clients
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Users can update clients in their tenant
DROP POLICY IF EXISTS "Users can update clients" ON clients;
CREATE POLICY "Users can update clients" ON clients
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

-- Only managers+ can delete clients
DROP POLICY IF EXISTS "Managers can delete clients" ON clients;
CREATE POLICY "Managers can delete clients" ON clients
  FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND user_has_role('manager'));

-- =====================================================================
-- 5. CREATE DEFAULT TENANT MEMBER FOR EXISTING USERS
-- =====================================================================

-- This will create tenant membership for any existing authenticated users
-- You may need to run this manually or adapt based on your setup
-- INSERT INTO tenant_members (tenant_id, user_id, role, status, joined_at)
-- SELECT
--   (SELECT id FROM tenants LIMIT 1),
--   id,
--   'owner',
--   'active',
--   NOW()
-- FROM auth.users
-- WHERE id NOT IN (SELECT user_id FROM tenant_members)
-- ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- =====================================================================
-- 6. VERIFICATION QUERIES (Run these after migration to verify)
-- =====================================================================

-- To run after migration:
/*

-- Check tenant members
SELECT tm.*, u.email, t.company_name
FROM tenant_members tm
JOIN auth.users u ON tm.user_id = u.id
JOIN tenants t ON tm.tenant_id = t.id;

-- Check tenant features
SELECT tf.*, t.company_name
FROM tenant_features tf
JOIN tenants t ON tf.tenant_id = t.id;

-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('tenants', 'tenant_members', 'b2c_quotes', 'b2b_quotes', 'itineraries', 'b2b_partners', 'clients');

-- Check policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

*/

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

-- Output success message
DO $$
BEGIN
  RAISE NOTICE 'Phase 1B Multi-Tenancy Migration Complete!';
  RAISE NOTICE '✅ Created: tenant_members table';
  RAISE NOTICE '✅ Created: tenant_features table';
  RAISE NOTICE '✅ Updated: clients table (added tenant_id)';
  RAISE NOTICE '✅ Enabled: RLS on all tables';
  RAISE NOTICE '✅ Created: RLS policies for tenant isolation';
  RAISE NOTICE '✅ Created: Helper functions (get_user_tenant_id, user_has_role)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Run verification queries to check setup';
  RAISE NOTICE '2. Create tenant_members records for existing users';
  RAISE NOTICE '3. Create TenantContext and useTenant hook';
  RAISE NOTICE '4. Update all API routes to use tenant context';
  RAISE NOTICE '5. Build tenant switcher UI';
END $$;
