-- =====================================================================
-- COMPLETE RLS DIAGNOSTIC
-- Check functions, tenant data, and client access
-- =====================================================================

-- 1. Check if functions exist
SELECT
  'get_user_tenant_id' as function_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.routines
      WHERE routine_name = 'get_user_tenant_id'
        AND routine_schema = 'public'
    )
    THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status
UNION ALL
SELECT
  'user_has_role' as function_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.routines
      WHERE routine_name = 'user_has_role'
        AND routine_schema = 'public'
    )
    THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status;

-- 2. Check your tenant membership
SELECT
  'Your Tenant Membership' as info,
  tm.tenant_id,
  tm.role,
  tm.status,
  t.company_name
FROM tenant_members tm
JOIN auth.users u ON u.id = tm.user_id
LEFT JOIN tenants t ON t.id = tm.tenant_id
WHERE u.email = 'islamjp69@gmail.com'
ORDER BY tm.created_at DESC
LIMIT 1;

-- 3. Test get_user_tenant_id() as superuser
SELECT
  'Testing get_user_tenant_id()' as test,
  (
    SELECT tenant_id
    FROM tenant_members
    WHERE user_id = (SELECT id FROM auth.users WHERE email = 'islamjp69@gmail.com')
    AND status = 'active'
    LIMIT 1
  ) as your_tenant_id;

-- 4. Check how many clients exist in your tenant
SELECT
  'Clients in your tenant' as info,
  COUNT(*) as client_count,
  (
    SELECT tenant_id
    FROM tenant_members
    WHERE user_id = (SELECT id FROM auth.users WHERE email = 'islamjp69@gmail.com')
    AND status = 'active'
    LIMIT 1
  ) as your_tenant_id
FROM clients
WHERE tenant_id = (
  SELECT tenant_id
  FROM tenant_members
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'islamjp69@gmail.com')
  AND status = 'active'
  LIMIT 1
);

-- 5. Check if clients table has tenant_id column
SELECT
  'clients table schema' as info,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'clients'
  AND table_schema = 'public'
  AND column_name IN ('id', 'tenant_id', 'name', 'email')
ORDER BY ordinal_position;

-- 6. Check if RLS is enabled on clients table
SELECT
  'RLS Status' as info,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'clients';

-- 7. List all policies on clients table
SELECT
  'Policies on clients' as info,
  policyname,
  cmd as command,
  CASE
    WHEN qual IS NOT NULL THEN 'Has USING clause'
    ELSE 'No USING clause'
  END as has_using,
  CASE
    WHEN with_check IS NOT NULL THEN 'Has WITH CHECK clause'
    ELSE 'No WITH CHECK clause'
  END as has_with_check
FROM pg_policies
WHERE tablename = 'clients';
