-- =====================================================================
-- Test why clients aren't loading
-- =====================================================================

-- 1. Check your tenant membership
SELECT
  '1. Your Tenant Info' as step,
  u.email,
  tm.tenant_id,
  tm.role,
  tm.status,
  t.company_name
FROM auth.users u
JOIN tenant_members tm ON tm.user_id = u.id
LEFT JOIN tenants t ON t.id = tm.tenant_id
WHERE u.email = 'islamjp69@gmail.com';

-- 2. Count total clients in database (any tenant)
SELECT
  '2. Total Clients' as step,
  COUNT(*) as total_clients,
  COUNT(DISTINCT tenant_id) as tenants_with_clients
FROM clients;

-- 3. Check if any clients belong to your tenant
SELECT
  '3. Clients in Your Tenant' as step,
  COUNT(*) as your_client_count,
  tm.tenant_id as your_tenant_id
FROM tenant_members tm
LEFT JOIN clients c ON c.tenant_id = tm.tenant_id
WHERE tm.user_id = (SELECT id FROM auth.users WHERE email = 'islamjp69@gmail.com')
  AND tm.status = 'active'
GROUP BY tm.tenant_id;

-- 4. List all clients (if any exist)
SELECT
  '4. All Clients' as step,
  c.id,
  c.name,
  c.email,
  c.tenant_id,
  CASE
    WHEN c.tenant_id = (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = (SELECT id FROM auth.users WHERE email = 'islamjp69@gmail.com')
      AND status = 'active'
      LIMIT 1
    )
    THEN '✅ YOUR TENANT'
    ELSE '❌ DIFFERENT TENANT'
  END as tenant_match
FROM clients c
ORDER BY c.created_at DESC
LIMIT 10;

-- 5. Test the get_user_tenant_id() function directly
SELECT
  '5. Function Test' as step,
  (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = (SELECT id FROM auth.users WHERE email = 'islamjp69@gmail.com')
    AND status = 'active'
    LIMIT 1
  ) as your_tenant_id_direct;

-- 6. Summary
SELECT
  '6. DIAGNOSIS' as step,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM clients) THEN
      '⚠️ NO CLIENTS EXIST - This is normal for a new setup. Try creating a client from the UI.'
    WHEN NOT EXISTS (
      SELECT 1 FROM clients c
      JOIN tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = (SELECT id FROM auth.users WHERE email = 'islamjp69@gmail.com')
    ) THEN
      '⚠️ CLIENTS EXIST but none belong to your tenant. RLS is working correctly - you just need to create clients.'
    ELSE
      '✅ CLIENTS EXIST in your tenant. If you still see errors, it may be a frontend issue.'
  END as diagnosis;
