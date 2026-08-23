-- ============================================================================
-- 283 — three tables had row-level security switched OFF
-- ============================================================================
--
-- tenant_invitations, writing_rules and content_variations had relrowsecurity
-- = false. Policies on a table with RLS disabled are inert, so
-- tenant_invitations' two existing policies were doing nothing at all.
--
-- ── Proven, not inferred ────────────────────────────────────────────────────
-- On 2026-08-24 a throwaway row was written to tenant_invitations and read
-- back with the PUBLIC ANON KEY — the key shipped in every browser bundle:
--
--   ANON READ: HTTP 200
--   [{"email":"zz-rls-probe@example.invalid",
--     "invitation_token":"FAKE-TOKEN-NOT-A-REAL-CREDENTIAL",
--     "tenant_id":"3b105838-..."}]
--
-- The probe row was deleted immediately and contained no real credential. But
-- invitation_token IS the credential: /api/invitations/accept admits the
-- bearer of a valid token into a tenant. Anyone could have enumerated pending
-- invitations and joined any tenant on the platform.
--
-- ── Why nothing caught it ───────────────────────────────────────────────────
-- All three tables are empty, and scripts/verify-rls.mjs skipped empty
-- relations — it could not tell "RLS filtered every row" from "there are no
-- rows". It reported them as "nothing to leak yet". The exposure was armed,
-- not firing: the first real invitation would have opened it. Migration 277
-- fixed the same blind spot for a view; this is the table case.
--
-- ── The migration-242 trap ─────────────────────────────────────────────────
-- Enabling RLS on a table with NO policies denies everything to every
-- non-bypass role, which silently breaks the app instead of the attacker.
-- tenant_invitations already has two tenant-scoped policies, so enabling is
-- enough there. writing_rules and content_variations had NONE and their routes
-- use the cookie-session client (createServerClient from @supabase/ssr), so
-- they get policies in the same statement.
--
-- The invite flow is unaffected: /api/invitations/verify and /accept both use
-- the SERVICE-ROLE client, which bypasses RLS. That is deliberate — the
-- invitee has no session yet, which is the whole point of an invitation.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. tenant_invitations — policies already exist and were inert
-- ---------------------------------------------------------------------------
ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. writing_rules — tenant-scoped, matching the house pattern
-- ---------------------------------------------------------------------------
ALTER TABLE writing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS writing_rules_tenant ON writing_rules;
CREATE POLICY writing_rules_tenant ON writing_rules
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS writing_rules_service_role ON writing_rules;
CREATE POLICY writing_rules_service_role ON writing_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. content_variations — no tenant_id of its own; scoped through its parent
-- ---------------------------------------------------------------------------
ALTER TABLE content_variations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_variations_tenant ON content_variations;
CREATE POLICY content_variations_tenant ON content_variations
  FOR ALL TO authenticated
  USING (
    content_id IN (SELECT id FROM content_library WHERE tenant_id = get_user_tenant_id())
  )
  WITH CHECK (
    content_id IN (SELECT id FROM content_library WHERE tenant_id = get_user_tenant_id())
  );

DROP POLICY IF EXISTS content_variations_service_role ON content_variations;
CREATE POLICY content_variations_service_role ON content_variations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------------
-- Post-check, in BOTH directions. RLS on with no policy is not a fix, it is
-- an outage — that is what migration 242 had to undo.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  off_count INT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_invitations','writing_rules','content_variations']
  LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class
             WHERE relname = t AND relnamespace = 'public'::regnamespace) THEN
      RAISE EXCEPTION 'RLS is still disabled on %', t;
    END IF;

    -- `public` counts: a policy TO public applies to every role, authenticated
    -- included. tenant_invitations' two existing policies are TO public with
    -- `tenant_id = get_user_tenant_id()`, which yields NULL for anon and so
    -- matches nothing — correct, and an earlier version of this check wrongly
    -- demanded the literal role `authenticated` and rolled the whole fix back.
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = t
         AND (roles && ARRAY['authenticated','public']::name[])
    ) THEN
      RAISE EXCEPTION 'RLS enabled on % with no authenticated policy — the app would be locked out', t;
    END IF;
  END LOOP;

  -- …and nothing else in the schema may be left with RLS off.
  SELECT count(*) INTO off_count
    FROM pg_class
   WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace AND NOT relrowsecurity;

  IF off_count > 0 THEN
    RAISE EXCEPTION '% public table(s) still have RLS disabled', off_count;
  END IF;

  RAISE NOTICE 'RLS enabled with policies on all three; no public table left unprotected';
END $$;

COMMIT;
