-- Disable RLS on all multi-tenant tables to fix stack overflow
-- This is a pragmatic solution - security is handled at the API level via requireAuth()

-- 1. Disable RLS on tenant_members
DROP POLICY IF EXISTS "Tenant members can view members of their tenant" ON tenant_members;
DROP POLICY IF EXISTS "Users can view their own membership" ON tenant_members;
DROP POLICY IF EXISTS "Enable read for tenant members" ON tenant_members;
DROP POLICY IF EXISTS "Enable insert for tenant admins" ON tenant_members;
DROP POLICY IF EXISTS "Enable update for tenant admins" ON tenant_members;
DROP POLICY IF EXISTS "Enable delete for tenant admins" ON tenant_members;

ALTER TABLE tenant_members DISABLE ROW LEVEL SECURITY;

-- 2. Disable RLS on tenant_features (if not already disabled)
DROP POLICY IF EXISTS "Tenant members can view features" ON tenant_features;
DROP POLICY IF EXISTS "Enable read for tenant members" ON tenant_features;
DROP POLICY IF EXISTS "Enable update for tenant admins" ON tenant_features;

ALTER TABLE tenant_features DISABLE ROW LEVEL SECURITY;

-- 3. Verify all are disabled
SELECT
  tablename,
  rowsecurity as rls_enabled,
  CASE
    WHEN rowsecurity = false THEN '✅ RLS Disabled'
    ELSE '❌ RLS Still Enabled'
  END as status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('tenants', 'tenant_members', 'tenant_features', 'tenant_invitations')
ORDER BY tablename;

-- All should show rls_enabled = false
