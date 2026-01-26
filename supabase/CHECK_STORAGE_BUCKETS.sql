-- Check if storage buckets exist
SELECT
  id,
  name,
  public,
  created_at
FROM storage.buckets
ORDER BY created_at DESC;

-- Check for tenant-logos bucket specifically
SELECT
  CASE
    WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'tenant-logos')
    THEN '✅ tenant-logos bucket EXISTS'
    ELSE '❌ tenant-logos bucket DOES NOT EXIST - needs to be created'
  END as bucket_status;

-- Check storage policies
SELECT
  policyname,
  cmd as operation,
  roles
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
ORDER BY policyname;
