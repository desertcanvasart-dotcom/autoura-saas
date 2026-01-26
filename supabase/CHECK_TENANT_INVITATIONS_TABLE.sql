-- Check if tenant_invitations table exists
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tenant_invitations'
ORDER BY ordinal_position;

-- If the query returns 0 rows, the table doesn't exist
