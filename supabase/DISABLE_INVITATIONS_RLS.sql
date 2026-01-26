-- Disable RLS on tenant_invitations table to fix stack overflow
-- Security is handled at the API level via requireAuth()

-- Drop all policies first
DROP POLICY IF EXISTS "Authenticated users can create invitations" ON tenant_invitations;
DROP POLICY IF EXISTS "Users can view invitations" ON tenant_invitations;
DROP POLICY IF EXISTS "Authenticated users can update invitations" ON tenant_invitations;
DROP POLICY IF EXISTS "Authenticated users can delete invitations" ON tenant_invitations;

-- Disable RLS entirely
ALTER TABLE tenant_invitations DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'tenant_invitations';

-- Should return rls_enabled = false
