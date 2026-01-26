-- Simple check for tenant-logos bucket
SELECT
  id,
  name,
  public as is_public,
  file_size_limit,
  allowed_mime_types,
  created_at
FROM storage.buckets
WHERE id = 'tenant-logos';

-- If the query above returns 0 rows, the bucket doesn't exist
-- If it returns 1 row with public = false, that's the problem
-- If it returns 1 row with public = true, the bucket is configured correctly
