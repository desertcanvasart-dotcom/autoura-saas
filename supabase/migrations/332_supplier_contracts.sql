-- ============================================================================
-- 332 — supplier_contracts: the agreements a company holds with its suppliers
-- ============================================================================
-- The supplier modal's Documents tab has read "Document management coming
-- soon" since the modal was built. Each company signs contracts, rate sheets
-- and allotment agreements with its hotels and cruise lines and has kept them
-- in email and shared drives. This is the index of those files. The bytes
-- live in a PRIVATE bucket and are only ever reached through a short-lived
-- signed URL minted behind a staff session — the same shape as
-- supplier-invoices (227/228) and traveller-documents (301). Nothing ever
-- calls getPublicUrl on this bucket.
--
-- A contract may be with the supplier as a whole or with ONE of its
-- properties (a cruise line's agreement for a specific ship): property_id.
--
-- Idempotent: safe to re-run.

BEGIN;

-- 1. The bucket. Column-detecting so it runs on real Supabase (size + MIME
--    ceilings as a second layer of defence) and in the from-scratch replay
--    test's minimal storage stub.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'file_size_limit'
  ) THEN
    EXECUTE $q$
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES ('supplier-contracts', 'supplier-contracts', false, 20971520,
              ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
      ON CONFLICT (id) DO UPDATE
        SET public = false,
            file_size_limit = EXCLUDED.file_size_limit,
            allowed_mime_types = EXCLUDED.allowed_mime_types
    $q$;
  ELSE
    EXECUTE $q$
      INSERT INTO storage.buckets (id, name, public)
      VALUES ('supplier-contracts', 'supplier-contracts', false)
      ON CONFLICT (id) DO UPDATE SET public = false
    $q$;
  END IF;
END $$;

-- 2. The index of what was uploaded.
CREATE TABLE IF NOT EXISTS supplier_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  -- Optional: the one ship / hotel this agreement covers.
  property_id UUID REFERENCES supplier_properties(id) ON DELETE SET NULL,

  document_type TEXT NOT NULL DEFAULT 'contract'
    CHECK (document_type IN ('contract', 'rate_sheet', 'allotment', 'license', 'insurance', 'other')),
  title VARCHAR(200) NOT NULL,
  valid_from DATE,
  valid_to DATE,
  notes TEXT,

  -- Key inside the supplier-contracts bucket. Never rendered as a URL.
  storage_path TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  -- Display only, already sanitised. Never used to build the storage key.
  original_filename VARCHAR(255),

  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT supplier_contracts_valid_range
    CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_supplier_contracts_supplier
  ON supplier_contracts (supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_contracts_tenant
  ON supplier_contracts (tenant_id);
-- The renewal view's query: what runs out soon.
CREATE INDEX IF NOT EXISTS idx_supplier_contracts_valid_to
  ON supplier_contracts (tenant_id, valid_to)
  WHERE valid_to IS NOT NULL;

-- Tenant isolation, same shape as 311: authenticated sees its tenant, the
-- service role passes (used only to move bytes for a row RLS already let
-- the caller read).
ALTER TABLE supplier_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_contracts_tenant ON supplier_contracts;
CREATE POLICY supplier_contracts_tenant ON supplier_contracts
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS supplier_contracts_service ON supplier_contracts;
CREATE POLICY supplier_contracts_service ON supplier_contracts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT public FROM storage.buckets WHERE id = 'supplier-contracts';  -- false
--   SELECT count(*) FROM information_schema.columns
--   WHERE table_name = 'supplier_contracts';                             -- 16
