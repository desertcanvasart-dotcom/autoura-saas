-- ============================================
-- 426: company logos — PNG/JPEG only, changed by owners and admins
-- ============================================
-- The tenant-logos bucket (038) is public and accepted SVG, which can carry
-- script; and any member of a company — a viewer included — could upload,
-- replace or delete that company's logo, which appears on every document it
-- sends. Logos are now PNG or JPEG (the only formats the PDFs can show; see
-- lib/logo-file.ts) and only an owner or admin changes them. Reading stays
-- public: the logo is on quotes and invoices sent to clients.
-- (split_part(name, '/', 1) is the first folder, as storage.foldername()[1].)

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'allowed_mime_types'
  ) THEN
    UPDATE storage.buckets
       SET allowed_mime_types = ARRAY['image/png', 'image/jpeg']::text[],
           file_size_limit = 2097152
     WHERE id = 'tenant-logos';
  END IF;
END $$;

DROP POLICY IF EXISTS "Users can upload logos for their tenant" ON storage.objects;
CREATE POLICY "Users can upload logos for their tenant"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tenant-logos' AND
  split_part(name, '/', 1) IN (
    SELECT tenant_id::text
    FROM public.tenant_members
    WHERE user_id = auth.uid() AND status = 'active' AND role IN ('owner', 'admin')
  )
);

DROP POLICY IF EXISTS "Users can update logos for their tenant" ON storage.objects;
CREATE POLICY "Users can update logos for their tenant"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tenant-logos' AND
  split_part(name, '/', 1) IN (
    SELECT tenant_id::text
    FROM public.tenant_members
    WHERE user_id = auth.uid() AND status = 'active' AND role IN ('owner', 'admin')
  )
)
WITH CHECK (
  bucket_id = 'tenant-logos' AND
  split_part(name, '/', 1) IN (
    SELECT tenant_id::text
    FROM public.tenant_members
    WHERE user_id = auth.uid() AND status = 'active' AND role IN ('owner', 'admin')
  )
);

DROP POLICY IF EXISTS "Users can delete logos for their tenant" ON storage.objects;
CREATE POLICY "Users can delete logos for their tenant"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'tenant-logos' AND
  split_part(name, '/', 1) IN (
    SELECT tenant_id::text
    FROM public.tenant_members
    WHERE user_id = auth.uid() AND status = 'active' AND role IN ('owner', 'admin')
  )
);

COMMIT;
