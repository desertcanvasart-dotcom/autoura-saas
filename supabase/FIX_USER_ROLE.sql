-- =====================================================================
-- Fix: Make current user an owner
-- =====================================================================

-- Option 1: Make the most recent user an owner (if that's you)
UPDATE tenant_members
SET role = 'owner'
WHERE user_id = (
  SELECT id FROM auth.users
  ORDER BY created_at DESC
  LIMIT 1
);

-- Option 2: Make a specific user an owner (replace with your email)
-- UPDATE tenant_members
-- SET role = 'owner'
-- WHERE user_id = (
--   SELECT id FROM auth.users
--   WHERE email = 'your-email@example.com'
-- );

-- Verify the change
SELECT
  u.email,
  tm.role as tenant_role,
  up.role as profile_role,
  tm.status
FROM auth.users u
LEFT JOIN tenant_members tm ON tm.user_id = u.id
LEFT JOIN user_profiles up ON up.id = u.id
ORDER BY u.created_at DESC
LIMIT 5;
