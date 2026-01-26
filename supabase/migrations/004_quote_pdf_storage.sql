-- =====================================================
-- Migration: 004 - Quote PDF Storage
-- Description: Add PDF URL columns and set up storage for quote PDFs
-- =====================================================

-- Add PDF URL columns to B2C quotes
ALTER TABLE b2c_quotes
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ;

-- Add PDF URL columns to B2B quotes
ALTER TABLE b2b_quotes
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ;

-- =====================================================
-- Storage Setup
-- =====================================================

-- Create storage bucket for quote PDFs (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'quote-pdfs',
  'quote-pdfs',
  false, -- Private bucket, accessible only with authentication
  10485760, -- 10MB limit per file
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- Storage RLS Policies
-- =====================================================

-- Allow authenticated users to upload PDFs to their tenant's folder
CREATE POLICY "Users can upload PDFs to their tenant folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'quote-pdfs' AND
  (storage.foldername(name))[1] IN (
    SELECT tenant_id::text
    FROM tenant_members
    WHERE user_id = auth.uid() AND status = 'active'
  )
);

-- Allow authenticated users to read PDFs from their tenant's folder
CREATE POLICY "Users can read PDFs from their tenant folder"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'quote-pdfs' AND
  (storage.foldername(name))[1] IN (
    SELECT tenant_id::text
    FROM tenant_members
    WHERE user_id = auth.uid() AND status = 'active'
  )
);

-- Allow authenticated users to update PDFs in their tenant's folder
CREATE POLICY "Users can update PDFs in their tenant folder"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'quote-pdfs' AND
  (storage.foldername(name))[1] IN (
    SELECT tenant_id::text
    FROM tenant_members
    WHERE user_id = auth.uid() AND status = 'active'
  )
)
WITH CHECK (
  bucket_id = 'quote-pdfs' AND
  (storage.foldername(name))[1] IN (
    SELECT tenant_id::text
    FROM tenant_members
    WHERE user_id = auth.uid() AND status = 'active'
  )
);

-- Allow authenticated users to delete PDFs from their tenant's folder
CREATE POLICY "Users can delete PDFs from their tenant folder"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'quote-pdfs' AND
  (storage.foldername(name))[1] IN (
    SELECT tenant_id::text
    FROM tenant_members
    WHERE user_id = auth.uid() AND status = 'active'
  )
);

-- =====================================================
-- Helper Function: Get PDF Storage Path
-- =====================================================

CREATE OR REPLACE FUNCTION get_quote_pdf_path(
  p_tenant_id UUID,
  p_quote_type TEXT, -- 'b2c' or 'b2b'
  p_quote_id UUID
)
RETURNS TEXT AS $$
BEGIN
  RETURN p_tenant_id::text || '/' || p_quote_type || '/' || p_quote_id::text || '.pdf';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON COLUMN b2c_quotes.pdf_url IS 'URL to the generated PDF file in Supabase storage';
COMMENT ON COLUMN b2c_quotes.pdf_generated_at IS 'Timestamp when the PDF was last generated';
COMMENT ON COLUMN b2b_quotes.pdf_url IS 'URL to the generated PDF rate sheet in Supabase storage';
COMMENT ON COLUMN b2b_quotes.pdf_generated_at IS 'Timestamp when the PDF was last generated';
COMMENT ON FUNCTION get_quote_pdf_path IS 'Returns the storage path for a quote PDF: {tenant_id}/{quote_type}/{quote_id}.pdf';
