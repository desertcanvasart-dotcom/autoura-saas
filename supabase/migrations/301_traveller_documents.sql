-- ============================================================================
-- 301 — traveller document uploads: PRIVATE bucket + index (C1b)
-- ============================================================================
--
-- The portal collects passport DETAILS as text (booking_passengers); this
-- adds the documents themselves — passport scan plus supporting files.
--
-- PRIVATE BUCKET, DELIBERATELY. A passport image must never be readable by
-- URL. Every read is a short-lived signed URL issued behind the portal gate
-- or a staff session; nothing ever calls getPublicUrl on this bucket.
--
-- RETENTION. purge_after is stamped per row AT UPLOAD from the booking's end
-- date — never recomputed, so moving a booking later cannot silently extend
-- how long a passport image is kept. The daily purge deletes the OBJECT and
-- keeps the ROW stamped purged_at: the record that we held a document and
-- destroyed it on schedule.

BEGIN;

-- 1. The bucket. The column-detecting branch keeps this runnable both on
--    real Supabase (full storage schema: size + MIME ceilings as a second
--    layer of defence) and in the from-scratch replay test's minimal stub.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'file_size_limit'
  ) THEN
    EXECUTE $q$
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES ('traveller-documents', 'traveller-documents', false, 10485760,
              ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
      ON CONFLICT (id) DO UPDATE
        SET public = false,
            file_size_limit = EXCLUDED.file_size_limit,
            allowed_mime_types = EXCLUDED.allowed_mime_types
    $q$;
  ELSE
    EXECUTE $q$
      INSERT INTO storage.buckets (id, name, public)
      VALUES ('traveller-documents', 'traveller-documents', false)
      ON CONFLICT (id) DO UPDATE SET public = false
    $q$;
  END IF;
END $$;

-- 2. The index of what was uploaded.
CREATE TABLE IF NOT EXISTS booking_passenger_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES booking_passengers(id) ON DELETE CASCADE,

  -- 'passport' is the one slot with meaning to the chase list; 'other' is
  -- whatever the traveller was asked for. The kind is ours, the label theirs.
  kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('passport', 'other')),
  label VARCHAR(120),

  -- Key inside the traveller-documents bucket. Never rendered as a URL.
  storage_path TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  -- Display only, already sanitised. Never used to build the storage key.
  original_filename VARCHAR(255),

  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 'portal' = the traveller themselves; 'operator' = on their behalf.
  uploaded_via TEXT NOT NULL DEFAULT 'portal' CHECK (uploaded_via IN ('portal', 'operator')),

  purge_after TIMESTAMPTZ,
  purged_at TIMESTAMPTZ
);

-- One live passport per traveller: a re-upload replaces, never accumulates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_passenger_documents_one_passport
  ON booking_passenger_documents(passenger_id)
  WHERE kind = 'passport' AND purged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_passenger_documents_passenger
  ON booking_passenger_documents(passenger_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_passenger_documents_booking
  ON booking_passenger_documents(booking_id);
-- The purge job's query: due, not yet purged.
CREATE INDEX IF NOT EXISTS idx_passenger_documents_purge
  ON booking_passenger_documents(purge_after)
  WHERE purged_at IS NULL;

ALTER TABLE booking_passenger_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_passenger_documents_tenant ON booking_passenger_documents;
CREATE POLICY booking_passenger_documents_tenant ON booking_passenger_documents
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS booking_passenger_documents_service ON booking_passenger_documents;
CREATE POLICY booking_passenger_documents_service ON booking_passenger_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT public FROM storage.buckets WHERE id = 'traveller-documents'; -- false
--   SELECT count(*) FROM information_schema.columns
--   WHERE table_name = 'booking_passenger_documents';                    -- 14
