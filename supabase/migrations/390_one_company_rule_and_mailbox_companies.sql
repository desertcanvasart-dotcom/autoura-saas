-- ============================================================================
-- 390 — One "which company" rule in the database; every mailbox filed
-- ============================================================================
-- Stage 0 of the multi-company owner dashboard (2026-09-25): the foundations
-- before anything is built on them.
--
-- 1. get_user_tenant_id() — the function about 270 RLS policies, the
--    user_has_role() checks and the auto_set_tenant_id() insert trigger all
--    rely on — was `SELECT tenant_id FROM tenant_members WHERE user_id =
--    auth.uid() LIMIT 1`: no status filter, no order. For anyone in two or
--    more companies it returned an unpredictable one, which need not be the
--    company the app shows (lib/supabase-server.ts, middleware.ts and both
--    contexts pick the OLDEST ACTIVE membership, then the lower tenant id —
--    guarded by lib/__tests__/membership-lookup-rule.test.ts). The page
--    could say Travel2Egypt while the database filtered by Sawa. It now uses
--    exactly the app's rule. It is also STABLE (one evaluation per
--    statement, not per row checked) and pins its search_path, as a
--    SECURITY DEFINER function should.
--
-- 2. tenant_members was readable only through `tenant_id =
--    get_user_tenant_id()`, so a person in several companies could not even
--    SEE their other memberships — the app's own "oldest membership" lookup
--    ran on one company's rows. A person may now read their OWN membership
--    rows (never anyone else's in another company).
--
-- 3. gmail_tokens.tenant_id: 4 of the 5 connected mailboxes (Afford Egypt,
--    Autoura Sandbox, Sawa, Sillage) were connected before the sign-in wrote
--    it (#475, 2026-09-20). Each owner belongs to exactly one company, so the
--    fill is unambiguous; the same rule as above decides it regardless.

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
    FROM public.tenant_members
   WHERE user_id = auth.uid()
     AND status = 'active'
   ORDER BY joined_at ASC NULLS LAST, tenant_id ASC
   LIMIT 1
$$;

DROP POLICY IF EXISTS "Users can view their own memberships" ON public.tenant_members;
CREATE POLICY "Users can view their own memberships" ON public.tenant_members
  FOR SELECT
  USING (user_id = auth.uid());

UPDATE public.gmail_tokens g
   SET tenant_id = (
         SELECT m.tenant_id
           FROM public.tenant_members m
          WHERE m.user_id = g.user_id
            AND m.status = 'active'
          ORDER BY m.joined_at ASC NULLS LAST, m.tenant_id ASC
          LIMIT 1)
 WHERE g.tenant_id IS NULL
   AND g.user_id IS NOT NULL;
