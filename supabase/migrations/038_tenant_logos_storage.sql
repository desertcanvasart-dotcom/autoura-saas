-- =====================================================
-- Migration: 038 - Tenant Logos Storage
-- Description: Set up storage bucket for tenant logos with RLS policies
-- =====================================================

-- Add logo URL column to tenants table (if not exists)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Add logo URL to tenant_features (if not exists)
ALTER TABLE tenant_features
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- =====================================================
-- Storage Setup
-- =====================================================

-- Create storage bucket for tenant logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tenant-logos',
  'tenant-logos',
  true, -- Public bucket, logos need to be displayed on PDFs and quotes
  2097152, -- 2MB limit per file
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- Storage RLS Policies
-- =====================================================

-- Allow authenticated users to upload logos for their tenant
CREATE POLICY "Users can upload logos for their tenant"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tenant-logos' AND
  (storage.foldername(name))[1] IN (
    SELECT tenant_id::text
    FROM tenant_members
    WHERE user_id = auth.uid() AND status = 'active'
  )
);

-- Allow public read access to all tenant logos (needed for display)
CREATE POLICY "Anyone can view tenant logos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'tenant-logos');

-- Allow authenticated users to update logos in their tenant's folder
CREATE POLICY "Users can update logos for their tenant"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tenant-logos' AND
  (storage.foldername(name))[1] IN (
    SELECT tenant_id::text
    FROM tenant_members
    WHERE user_id = auth.uid() AND status = 'active'
  )
)
WITH CHECK (
  bucket_id = 'tenant-logos' AND
  (storage.foldername(name))[1] IN (
    SELECT tenant_id::text
    FROM tenant_members
    WHERE user_id = auth.uid() AND status = 'active'
  )
);

-- Allow authenticated users to delete logos from their tenant's folder
CREATE POLICY "Users can delete logos for their tenant"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'tenant-logos' AND
  (storage.foldername(name))[1] IN (
    SELECT tenant_id::text
    FROM tenant_members
    WHERE user_id = auth.uid() AND status = 'active'
  )
);

-- =====================================================
-- Helper Function: Get Logo Storage Path
-- =====================================================

CREATE OR REPLACE FUNCTION get_tenant_logo_path(
  p_tenant_id UUID,
  p_file_extension TEXT
)
RETURNS TEXT AS $$
BEGIN
  RETURN p_tenant_id::text || '/' || p_tenant_id::text || '-' || extract(epoch from now())::bigint || '.' || p_file_extension;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON COLUMN tenants.logo_url IS 'URL to the tenant logo in Supabase storage';
COMMENT ON COLUMN tenant_features.logo_url IS 'URL to the tenant logo in Supabase storage (cached from tenants table)';
COMMENT ON FUNCTION get_tenant_logo_path IS 'Returns the storage path for a tenant logo: {tenant_id}/{tenant_id}-{timestamp}.{ext}';
