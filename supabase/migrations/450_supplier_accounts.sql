-- ============================================
-- 450: supplier accounts (Supplier Network Phase 2B)
-- ============================================
-- docs/supplier-network/PLAN.md §6 stage 2B (approved 2026-10-30). A
-- supplier signs in with their phone number and a one-time code, and sees
-- every agency that approved them in one inbox.
--
-- Suppliers are NOT tenant users: an account is never a Supabase auth user
-- and never holds the `authenticated` role, so no tenant policy can match it.
-- The supplier's pages and APIs run with the service role, scoped in code to
-- the approved links — the 2A model, with a session instead of a link.
--
--   supplier_accounts          one per phone number (international digits).
--   supplier_account_links     the claim: an account ↔ one agency's supplier
--                              record. Pending until THAT agency's admin
--                              approves (decision §9: an admin approves every
--                              merge). A record is approved for one account.
--   supplier_login_codes       6-digit codes, stored as a hash; 10 minutes,
--                              5 tries (enforced in lib/supplier-accounts).
--   supplier_sessions          the signed-in cookie's token, as a hash;
--                              expiring and revocable.

BEGIN;

CREATE TABLE IF NOT EXISTS public.supplier_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL UNIQUE CHECK (phone ~ '^[0-9]{8,15}$'),
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ
);
COMMENT ON TABLE public.supplier_accounts IS
  'A supplier''s own sign-in, by phone (450). Not a tenant user: service role only.';

CREATE TABLE IF NOT EXISTS public.supplier_account_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.supplier_accounts(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  UNIQUE (account_id, supplier_id)
);
-- One account per supplier record, once approved.
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_account_links_approved
  ON public.supplier_account_links (supplier_id) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_supplier_account_links_tenant ON public.supplier_account_links (tenant_id, status);
COMMENT ON TABLE public.supplier_account_links IS
  'A supplier account''s claim on one agency''s supplier record (450): pending until that agency''s admin approves.';

CREATE TABLE IF NOT EXISTS public.supplier_login_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.supplier_accounts(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  sent_to TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_supplier_login_codes_account ON public.supplier_login_codes (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.supplier_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.supplier_accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_supplier_sessions_account ON public.supplier_sessions (account_id);

-- Row security: ON for all four. Accounts, codes and sessions: the service
-- role only (no policy for anyone else = nothing visible to a signed-in user).
ALTER TABLE public.supplier_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_account_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_login_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_accounts_service_role ON public.supplier_accounts;
CREATE POLICY supplier_accounts_service_role ON public.supplier_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS supplier_login_codes_service_role ON public.supplier_login_codes;
CREATE POLICY supplier_login_codes_service_role ON public.supplier_login_codes FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS supplier_sessions_service_role ON public.supplier_sessions;
CREATE POLICY supplier_sessions_service_role ON public.supplier_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Links: the agency sees its own claims and decides them (the API demands
-- an admin); it never creates one — only the sign-in does, as the service role.
DROP POLICY IF EXISTS supplier_account_links_tenant_read ON public.supplier_account_links;
CREATE POLICY supplier_account_links_tenant_read ON public.supplier_account_links
  FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());
DROP POLICY IF EXISTS supplier_account_links_tenant_decide ON public.supplier_account_links;
CREATE POLICY supplier_account_links_tenant_decide ON public.supplier_account_links
  FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND public.member_can_write(tenant_id))
  WITH CHECK (tenant_id = get_user_tenant_id() AND public.member_can_write(tenant_id));
DROP POLICY IF EXISTS supplier_account_links_service_role ON public.supplier_account_links;
CREATE POLICY supplier_account_links_service_role ON public.supplier_account_links FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
