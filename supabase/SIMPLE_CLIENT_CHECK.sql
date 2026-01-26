-- =====================================================================
-- Simple client diagnostic
-- =====================================================================

-- 1. Check clients table schema
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'clients'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Your tenant info
SELECT
  '2. Your Tenant' as step,
  tm.tenant_id,
  tm.role,
  tm.status
FROM tenant_members tm
WHERE tm.user_id = (SELECT id FROM auth.users WHERE email = 'islamjp69@gmail.com')
  AND tm.status = 'active';

-- 3. Total clients
SELECT
  '3. Total Clients' as step,
  COUNT(*) as total_clients
FROM clients;

-- 4. Your clients
SELECT
  '4. Your Clients' as step,
  COUNT(*) as your_client_count
FROM clients c
JOIN tenant_members tm ON c.tenant_id = tm.tenant_id
WHERE tm.user_id = (SELECT id FROM auth.users WHERE email = 'islamjp69@gmail.com')
  AND tm.status = 'active';
