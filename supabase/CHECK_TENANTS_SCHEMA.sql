-- Check which columns exist in tenants table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tenants'
  AND table_schema = 'public'
ORDER BY ordinal_position;
