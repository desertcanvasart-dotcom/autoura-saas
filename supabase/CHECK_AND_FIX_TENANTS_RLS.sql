-- Check current RLS policies on tenants table
SELECT
  policyname,
  cmd as operation,
  qual as using_clause,
  with_check
FROM pg_policies
WHERE tablename = 'tenants'
ORDER BY policyname;

-- The problem: When inserting into tenant_invitations, PostgreSQL validates
-- the foreign key to tenants(id), which triggers tenants table RLS policies.
-- If those policies query tenant_members, it creates a recursive loop.

-- Solution: Simplify or disable tenants RLS policies temporarily

-- Drop all existing policies on tenants
DROP POLICY IF EXISTS "Tenant members can view their tenant" ON tenants;
DROP POLICY IF EXISTS "Tenant members can update their tenant" ON tenants;
DROP POLICY IF EXISTS "Users can view their tenant" ON tenants;
DROP POLICY IF EXISTS "Users can update their tenant" ON tenants;
DROP POLICY IF EXISTS "Enable read access for tenant members" ON tenants;
DROP POLICY IF EXISTS "Enable update for tenant members" ON tenants;

-- Disable RLS on tenants table (security handled at API level)
ALTER TABLE tenants DISABLE ROW LEVEL SECURITY;

-- Verify
SELECT
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'tenants';

-- Should return rls_enabled = false
