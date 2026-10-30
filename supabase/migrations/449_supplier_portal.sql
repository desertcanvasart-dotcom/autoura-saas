-- ============================================
-- 449: the supplier's own page (Supplier Network Phase 2A)
-- ============================================
-- docs/supplier-network/PLAN.md §6, stage 2A (operator, 2026-10-30): before
-- any supplier logins, each supplier gets ONE permanent link from each agency
-- — a page listing that agency's requests to them, their upcoming and done
-- jobs, what they are owed, and days they cannot work.
--
-- supplier_portal_links: the per-request reply links (448) stay; this is the
-- per-SUPPLIER link. Same trust model (286/448): the token is the credential,
-- the page and its API run with the service role behind middleware, revoking
-- kills the URL. No expiry — it is the supplier's standing page; the office
-- revokes and resends to change it. One ACTIVE link per supplier per agency.
--
-- supplier_unavailable_days: days a supplier marked they cannot work (from
-- their page) or the office marked for them. A WARNING in "Who covers it",
-- never a block (operator default, 2026-10-30).

BEGIN;

CREATE TABLE IF NOT EXISTS public.supplier_portal_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_opened_at TIMESTAMPTZ,
  -- Revoke, never delete: the row stays as the record that a link existed.
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_portal_links_active
  ON public.supplier_portal_links (tenant_id, supplier_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_portal_links_supplier ON public.supplier_portal_links (supplier_id);

COMMENT ON TABLE public.supplier_portal_links IS
  'A supplier''s standing no-login page from one agency (449): the token is the credential; revocable.';

CREATE TABLE IF NOT EXISTS public.supplier_unavailable_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  note TEXT,
  marked_by VARCHAR(20) NOT NULL DEFAULT 'supplier' CHECK (marked_by IN ('supplier', 'office')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, supplier_id, day)
);
CREATE INDEX IF NOT EXISTS idx_supplier_unavailable_days_day ON public.supplier_unavailable_days (tenant_id, day);

COMMENT ON TABLE public.supplier_unavailable_days IS
  'Days a supplier cannot work, for one agency (449): a warning when choosing who covers a line, never a block.';

-- Both: the agency's own rows; viewers read, they do not write (424's rule);
-- the service role (the supplier's page) does the rest.
ALTER TABLE public.supplier_portal_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_unavailable_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_portal_links_tenant ON public.supplier_portal_links;
CREATE POLICY supplier_portal_links_tenant ON public.supplier_portal_links
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());
DROP POLICY IF EXISTS supplier_unavailable_days_tenant ON public.supplier_unavailable_days;
CREATE POLICY supplier_unavailable_days_tenant ON public.supplier_unavailable_days
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS "Viewers cannot insert" ON public.supplier_portal_links;
CREATE POLICY "Viewers cannot insert" ON public.supplier_portal_links
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.member_can_write(tenant_id));
DROP POLICY IF EXISTS "Viewers cannot update" ON public.supplier_portal_links;
CREATE POLICY "Viewers cannot update" ON public.supplier_portal_links
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.member_can_write(tenant_id)) WITH CHECK (public.member_can_write(tenant_id));
DROP POLICY IF EXISTS "Viewers cannot delete" ON public.supplier_portal_links;
CREATE POLICY "Viewers cannot delete" ON public.supplier_portal_links
  AS RESTRICTIVE FOR DELETE TO authenticated USING (public.member_can_write(tenant_id));

DROP POLICY IF EXISTS "Viewers cannot insert" ON public.supplier_unavailable_days;
CREATE POLICY "Viewers cannot insert" ON public.supplier_unavailable_days
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.member_can_write(tenant_id));
DROP POLICY IF EXISTS "Viewers cannot update" ON public.supplier_unavailable_days;
CREATE POLICY "Viewers cannot update" ON public.supplier_unavailable_days
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.member_can_write(tenant_id)) WITH CHECK (public.member_can_write(tenant_id));
DROP POLICY IF EXISTS "Viewers cannot delete" ON public.supplier_unavailable_days;
CREATE POLICY "Viewers cannot delete" ON public.supplier_unavailable_days
  AS RESTRICTIVE FOR DELETE TO authenticated USING (public.member_can_write(tenant_id));

DROP POLICY IF EXISTS supplier_portal_links_service_role ON public.supplier_portal_links;
CREATE POLICY supplier_portal_links_service_role ON public.supplier_portal_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS supplier_unavailable_days_service_role ON public.supplier_unavailable_days;
CREATE POLICY supplier_unavailable_days_service_role ON public.supplier_unavailable_days
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
