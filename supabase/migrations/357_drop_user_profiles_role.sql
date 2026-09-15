-- ============================================================================
-- 357 — Drop user_profiles.role, the role system that decided nothing
-- ============================================================================
--
-- APPLY THIS *AFTER* THE DEPLOY THAT REMOVES THE READERS HAS FINISHED.
-- Running code must not query a column that no longer exists (the 240 rule).
-- The readers went in #404, verified serving in production before this was
-- written.
--
-- The app carried two role columns enforcing different things about the same
-- person: tenant_members.role, scoped to a workspace, read by the API routes;
-- and user_profiles.role, one global row per account, read by the middleware,
-- useRole() and the sidebar. Nothing kept them in agreement, and nothing in
-- the application ever WROTE the profile one — the Team UI's role change
-- updates the membership only. So a demotion demoted nobody: the routes
-- restricted them, the middleware and sidebar carried on unchanged. 227 exists
-- because of the mirror-image drift, and its own note calls one role system
-- the right answer, out of scope there.
--
-- #404 made tenant_members.role the single source (lib/roles.ts, which folds
-- 'owner' into 'admin' because ROUTE_PERMISSIONS has no 'owner' entry). This
-- drops the column that is now read by nothing.
--
-- The signup trigger still WRITES it, so it is redefined first — otherwise the
-- DROP breaks signup the way 240 once did, and the way 343 had to guard
-- against. Only the user_profiles INSERT changes; the rest is 356's text
-- verbatim.
--
-- Measured before writing this (8 active memberships, every one an 'owner'):
-- 7 profiles said 'admin', 1 said 'manager'. Nothing anywhere depended on the
-- column's value any more.
--
-- No CASCADE: if a policy or view still depends on it, fail loudly. Functions
-- are not dependency-tracked — plpgsql bodies are just strings — so those are
-- scanned explicitly below.
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id UUID;
  v_company_name VARCHAR(255);
  v_invited_tenant UUID;
BEGIN
  -- Both signals, in cheap-first order: the metadata flag costs nothing, the
  -- invitation lookup is only run when the flag claims there is one.
  IF NEW.raw_user_meta_data ? 'invited_to_tenant' THEN
    v_invited_tenant := public.pending_invitation_tenant(NEW.email);
  END IF;

  IF v_invited_tenant IS NOT NULL THEN
    -- An invitee joins an existing company. No tenant, no membership, no
    -- features row: /api/invitations/accept creates the membership from the
    -- token, and that membership IS the grant — there is no longer a second
    -- role to write here.
    SELECT t.company_name INTO v_company_name
      FROM tenants t WHERE t.id = v_invited_tenant;

    INSERT INTO user_profiles (id, email, full_name, company_name, is_active)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), v_company_name, true)
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      company_name = EXCLUDED.company_name,
      updated_at = NOW();

    RETURN NEW;
  END IF;

  -- ---- ordinary signup: 356's body, less the retired profile role ------
  v_company_name := COALESCE(
    NEW.raw_user_meta_data->>'company_name',
    SPLIT_PART(NEW.email, '@', 1) || '''s Company'
  );

  INSERT INTO tenants (company_name, contact_email)
  VALUES (v_company_name, NEW.email)
  RETURNING id INTO v_tenant_id;

  -- This line is now the whole grant. 227 also wrote role='admin' onto the
  -- profile below, because back then the sidebar and middleware read that and
  -- a new owner otherwise landed on the 'agent' default with no Settings, no
  -- Rates and no Finance. They read this row instead now.
  INSERT INTO tenant_members (tenant_id, user_id, role, status, joined_at)
  VALUES (v_tenant_id, NEW.id, 'owner', 'active', NOW());

  INSERT INTO user_profiles (id, email, full_name, company_name, is_active)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), v_company_name, true)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    company_name = EXCLUDED.company_name,
    updated_at = NOW();

  INSERT INTO tenant_features (
    tenant_id, primary_color, secondary_color, custom_settings,
    onboarding_completed, onboarding_step
  ) VALUES (
    v_tenant_id, '#2d3b2d', '#263A29', '{}'::jsonb, false, 0
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[SIGNUP] FAILED for user %: % (SQLSTATE: %)', NEW.email, SQLERRM, SQLSTATE;
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

ALTER TABLE user_profiles DROP COLUMN IF EXISTS role;

-- ============================================================================
-- Post-checks, inside the transaction.
--
-- These matter more here than usual. plpgsql does not resolve column
-- references when a function is created — the body is stored as text and the
-- INSERT is planned on first execution. A function still naming
-- user_profiles.role would therefore be accepted by CREATE OR REPLACE above,
-- drop cleanly past the ALTER, and only fail at the next real signup, in
-- production, for a customer. That is precisely what 240 did.
--
-- A bare scan for the word 'role' is useless (tenant_members.role, the
-- invitation role, half the codebase), so the scans below are shaped to the
-- two ways a function can write this particular column.
-- ============================================================================

DO $$
DECLARE
  fn text;
BEGIN
  -- INSERT INTO user_profiles (..., role, ...)
  SELECT proname INTO fn
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND prosrc ~* 'INTO\s+user_profiles\s*\([^)]*\mrole\M'
   LIMIT 1;
  IF fn IS NOT NULL THEN
    RAISE EXCEPTION 'function % still INSERTs user_profiles.role', fn;
  END IF;

  -- UPDATE user_profiles SET ... role = ...
  SELECT proname INTO fn
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND prosrc ~* 'UPDATE\s+user_profiles\s+SET[^;]*\mrole\M\s*='
   LIMIT 1;
  IF fn IS NOT NULL THEN
    RAISE EXCEPTION 'function % still UPDATEs user_profiles.role', fn;
  END IF;
END $$;

-- The column is actually gone (DROP ... IF EXISTS is silent either way).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'user_profiles'
       AND column_name = 'role'
  ) THEN
    RAISE EXCEPTION 'user_profiles.role is still present';
  END IF;
END $$;

-- The trigger must still be attached. CREATE OR REPLACE FUNCTION does not
-- touch it, but without it none of the above runs on a real signup.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'auth.users'::regclass
       AND NOT tgisinternal
       AND tgfoid = 'public.handle_new_user_signup'::regproc
  ) THEN
    RAISE EXCEPTION 'handle_new_user_signup is not attached to auth.users';
  END IF;
END $$;

-- The invitation gate from 356 must have survived: it is what stops an invitee
-- being given a company of their own, and this migration rewrote the function
-- around it.
DO $$
BEGIN
  IF (SELECT prosrc FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace
         AND proname = 'handle_new_user_signup')
     NOT LIKE '%pending_invitation_tenant%'
  THEN
    RAISE EXCEPTION 'the 356 invitation gate is missing from handle_new_user_signup';
  END IF;
END $$;

COMMIT;
