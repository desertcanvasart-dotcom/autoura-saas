-- ============================================
-- 448: the supplier's one-tap reply link (Phase 1, step 4)
-- ============================================
-- docs/supplier-network/PLAN.md §5 step 4. The operator requests a service
-- from a supplier with their own WhatsApp (D2: wa.me, the message pre-typed);
-- the message carries a link the supplier opens without logging in to
-- Accept, Decline, or name the car (plate) or guide — plus an optional
-- driver-of-the-day note (D1: the car is booked, not the driver).
--
-- Same trust model as staff_links (286): the token IS the credential, the
-- page and its API run with the service role behind middleware, and revoking
-- kills the only URL. A sister table, not staff_links itself: a staff link
-- belongs to an itinerary_resources assignment (NOT NULL), and a supplier
-- line has none. It also EXPIRES — the day after the service — because a
-- supplier is outside the company.
--
-- One ACTIVE link per service booking; asking again reuses it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.service_booking_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  service_booking_id UUID NOT NULL
    REFERENCES public.booking_supplier_status(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The day after the service; NULL = the service has no date yet.
  expires_at TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,
  -- Revoke, never delete: the row stays as the record that a link existed.
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_booking_links_active
  ON public.service_booking_links (service_booking_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_booking_links_tenant ON public.service_booking_links (tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_booking_links_booking ON public.service_booking_links (booking_id);

COMMENT ON TABLE public.service_booking_links IS
  'A supplier''s no-login reply link for one service booking (448): the token is the credential; revocable; expires the day after the service.';

ALTER TABLE public.service_booking_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_booking_links_tenant ON public.service_booking_links;
CREATE POLICY service_booking_links_tenant ON public.service_booking_links
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Viewers read; they do not write (424's rule).
DROP POLICY IF EXISTS "Viewers cannot insert" ON public.service_booking_links;
CREATE POLICY "Viewers cannot insert" ON public.service_booking_links
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.member_can_write(tenant_id));
DROP POLICY IF EXISTS "Viewers cannot update" ON public.service_booking_links;
CREATE POLICY "Viewers cannot update" ON public.service_booking_links
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.member_can_write(tenant_id)) WITH CHECK (public.member_can_write(tenant_id));
DROP POLICY IF EXISTS "Viewers cannot delete" ON public.service_booking_links;
CREATE POLICY "Viewers cannot delete" ON public.service_booking_links
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.member_can_write(tenant_id));

DROP POLICY IF EXISTS service_booking_links_service_role ON public.service_booking_links;
CREATE POLICY service_booking_links_service_role ON public.service_booking_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
