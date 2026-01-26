-- Get the actual policy definition
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check
FROM pg_policies
WHERE tablename = 'tenants'
  AND cmd = 'UPDATE';
