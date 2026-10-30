-- ============================================
-- 453: the shared supplier network (Phase 3)
-- ============================================
-- docs/supplier-network/PLAN.md §7 (approved 2026-10-30). A supplier account
-- (450) may JOIN the network: a profile any agency using the network can
-- find once the Autoura team has verified it. An agency that adds a network
-- supplier gets an ordinary supplier on its OWN book, connected to the
-- account — its rates and notes on that copy stay its own (the white-label
-- rule: nothing an agency prices from is shared). Prices are agreed per
-- request (decision §7); suppliers publish none.
--
--   tenants.supplier_sourcing      own (default) · network · both — one per agency.
--   supplier_network_profiles      one per account: what other agencies may see.
--                                  No phone, no email: contact details reach an
--                                  agency only when it adds the supplier.
--   supplier_network_documents     licence / vehicle papers, private bucket,
--                                  read by the Autoura team only.
--   suppliers.network_account_id   this agency's supplier is a copy of that
--                                  network account (one copy per agency).

BEGIN;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS supplier_sourcing VARCHAR(10) NOT NULL DEFAULT 'own'
    CHECK (supplier_sourcing IN ('own', 'network', 'both'));

CREATE TABLE IF NOT EXISTS public.supplier_network_profiles (
  account_id UUID PRIMARY KEY REFERENCES public.supplier_accounts(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 120),
  kinds TEXT[] NOT NULL DEFAULT '{}',
  cities TEXT[] NOT NULL DEFAULT '{}',
  languages TEXT[] NOT NULL DEFAULT '{}',
  about TEXT CHECK (about IS NULL OR length(about) <= 1000),
  -- The supplier chose to be found. Off = hidden, whatever its verification.
  listed BOOLEAN NOT NULL DEFAULT false,
  verification_status VARCHAR(20) NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
  verification_note TEXT,
  verified_at TIMESTAMPTZ,
  verified_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supplier_network_profiles_found
  ON public.supplier_network_profiles (verification_status) WHERE listed;
COMMENT ON TABLE public.supplier_network_profiles IS
  'What other agencies may see of a network supplier (453): no contact details. Found only when listed AND verified.';

CREATE TABLE IF NOT EXISTS public.supplier_network_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.supplier_accounts(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('licence', 'vehicle', 'insurance', 'other')),
  title VARCHAR(200) NOT NULL,
  -- Key inside the supplier-network bucket. Never rendered as a URL.
  storage_path TEXT NOT NULL,
  mime_type VARCHAR(100),
  size_bytes INTEGER,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supplier_network_documents_account ON public.supplier_network_documents (account_id);

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS network_account_id UUID REFERENCES public.supplier_accounts(id) ON DELETE SET NULL;
-- One copy of a network supplier per agency.
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_network_copy
  ON public.suppliers (tenant_id, network_account_id) WHERE network_account_id IS NOT NULL;

-- The papers' bucket: private; read with the service role by the Autoura team.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'file_size_limit'
  ) THEN
    EXECUTE $q$
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES ('supplier-network', 'supplier-network', false, 10485760,
              ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
      ON CONFLICT (id) DO UPDATE
        SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types
    $q$;
  ELSE
    EXECUTE $q$
      INSERT INTO storage.buckets (id, name, public)
      VALUES ('supplier-network', 'supplier-network', false)
      ON CONFLICT (id) DO UPDATE SET public = false
    $q$;
  END IF;
END $$;

-- Row security. Profiles: a signed-in agency user may READ only listed AND
-- verified profiles (the search); nobody signed in writes them — the
-- supplier's pages and the Autoura team use the service role. Papers: the
-- service role only.
ALTER TABLE public.supplier_network_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_network_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_network_profiles_found ON public.supplier_network_profiles;
CREATE POLICY supplier_network_profiles_found ON public.supplier_network_profiles
  FOR SELECT TO authenticated USING (listed AND verification_status = 'verified');
DROP POLICY IF EXISTS supplier_network_profiles_service_role ON public.supplier_network_profiles;
CREATE POLICY supplier_network_profiles_service_role ON public.supplier_network_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS supplier_network_documents_service_role ON public.supplier_network_documents;
CREATE POLICY supplier_network_documents_service_role ON public.supplier_network_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
