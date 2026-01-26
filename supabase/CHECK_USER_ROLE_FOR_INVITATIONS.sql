-- Check if the current user has permission to create invitations
-- (must be owner or admin)

-- Check your current user's role
SELECT
  tm.user_id,
  tm.tenant_id,
  tm.role,
  tm.status,
  u.email
FROM tenant_members tm
JOIN auth.users u ON u.id = tm.user_id
ORDER BY tm.created_at DESC
LIMIT 5;

-- Test if the RLS policy would allow insert
-- This checks if your user would pass the INSERT policy
SELECT
  auth.uid() as current_user_id,
  tm.tenant_id,
  tm.role,
  CASE
    WHEN tm.role IN ('owner', 'admin') THEN '✅ Can create invitations'
    ELSE '❌ Cannot create invitations (role must be owner or admin)'
  END as permission
FROM tenant_members tm
WHERE tm.user_id = auth.uid()
  AND tm.status = 'active';
