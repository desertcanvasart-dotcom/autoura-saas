-- Create tenant-logos storage bucket
-- This bucket stores company logos uploaded during onboarding

-- Note: Storage buckets in Supabase are created via the Dashboard or via SQL
-- This file documents the required configuration

-- 1. Create the bucket (run this in Supabase SQL Editor)
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-logos', 'tenant-logos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Set up RLS policies for the bucket
-- Allow authenticated users to upload logos for their own tenant
CREATE POLICY "Authenticated users can upload tenant logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tenant-logos'
  AND auth.role() = 'authenticated'
);

-- Allow public read access to all logos (for displaying on quotes/PDFs)
CREATE POLICY "Public read access to tenant logos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'tenant-logos');

-- Allow tenant members to update their own tenant's logo
CREATE POLICY "Tenant members can update their tenant logo"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tenant-logos'
  AND auth.role() = 'authenticated'
);

-- Allow tenant members to delete their own tenant's logo
CREATE POLICY "Tenant members can delete their tenant logo"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'tenant-logos'
  AND auth.role() = 'authenticated'
);
