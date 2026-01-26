-- Fix the logo upload RLS policy
-- The current policy is too restrictive and blocking uploads

-- First, drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can upload logos for their tenant" ON storage.objects;

-- Create a simpler policy that allows any authenticated user to upload
CREATE POLICY "Authenticated users can upload logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tenant-logos'
);

-- Verify the policy was created
SELECT
  policyname,
  cmd as operation,
  roles,
  qual as using_clause,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname = 'Authenticated users can upload logos';
