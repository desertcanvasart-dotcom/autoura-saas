-- ============================================================================
-- 414 — one login, several companies: the company you are working in
-- ============================================================================
--
-- A person can belong to several companies (tenant_members is unique per
-- tenant/user PAIR), but nothing let them choose one: get_user_tenant_id() —
-- behind about 270 RLS policies, user_has_role() and the tenant_id insert
-- trigger — and every app layer took the OLDEST active membership (migration
-- 390). A second company joined by invitation was never shown.
--
-- user_profiles.active_tenant_id is the person's choice, set by the company
-- switcher (POST /api/me/active-company, which checks the membership). The
-- rule is now: the chosen company while the person is an ACTIVE member of it,
-- otherwise the oldest active membership, then the lower id — exactly as
-- before, so nobody with one company sees any change. A stale or forged
-- choice (deactivated there, or never a member) is simply ignored: the
-- membership join below is what admits it.
--
-- The app asks the database which company is current (rpc
-- get_user_tenant_id) instead of re-implementing the rule, so the page, the
-- API and RLS cannot disagree. Idempotent.
-- ============================================================================

BEGIN;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS active_tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.tenant_id
    FROM public.tenant_members m
    LEFT JOIN public.user_profiles p ON p.id = m.user_id
   WHERE m.user_id = auth.uid()
     AND m.status = 'active'
   ORDER BY (m.tenant_id IS NOT DISTINCT FROM p.active_tenant_id) DESC,
            m.joined_at ASC NULLS LAST,
            m.tenant_id ASC
   LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_user_tenant_id() TO authenticated;

COMMIT;
