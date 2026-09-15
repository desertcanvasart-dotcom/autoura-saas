-- ============================================================================
-- 356 — An invited user must not be given a company of their own
-- ============================================================================
--
-- handle_new_user_signup() (last defined in 343) fires for EVERY auth.users
-- insert and unconditionally mints a tenant, makes the new user its 'owner',
-- and seeds tenant_features. That is right for someone signing up at /signup.
-- It is wrong for someone arriving through an invitation link: they got their
-- own empty company and owner role, the invitation was marked accepted, and
-- they never reached the company that invited them. The invited role was
-- discarded. Nothing in the application ever inserted into tenant_members.
--
-- This migration gates the tenant-minting half of the trigger. Membership
-- itself is NOT created here: only /api/invitations/accept knows which
-- invitation token was presented, and therefore which tenant and which role.
-- Matching on email alone would pick the wrong tenant when two companies have
-- invited the same address.
--
-- THE GATE NEEDS TWO SIGNALS, BOTH REQUIRED
--
--   1. NEW.raw_user_meta_data carries 'invited_to_tenant', and
--   2. a genuinely pending, unexpired invitation exists for NEW.email.
--
-- Neither alone is safe:
--
--   * Signal 2 alone would break ordinary signup. Someone with a pending
--     invitation from company A who instead signs up at /signup to start
--     their own company would get NO tenant at all — the exact failure mode
--     240 caused, and the one worth being most careful about here.
--
--   * Signal 1 alone is caller-controlled. supabase.auth.signUp() lets a
--     browser put anything in options.data, so a metadata flag is a request,
--     never a proof. Requiring signal 2 as well means the worst a forged flag
--     can do is suppress the forger's OWN tenant — no access to anyone
--     else's, because this trigger grants no membership whatsoever.
--
-- The invitee still gets a user_profiles row (264's tenant_members trigger and
-- the rest of the app expect one). Its role is deliberately left at the column
-- default: the accept route sets it from the invitation, which is the only
-- place that knows the invited role. See 227 — the UI and middleware enforce
-- user_profiles.role, NOT tenant_members.role, so an invited 'manager' whose
-- profile role is never set would land with a stripped sidebar.
--
-- Everything else is 343's text verbatim.
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

-- The invitation half of the gate, as its own function so it can be probed
-- directly (see the post-check below) rather than only through a signup.
-- Returns the tenant of the newest valid pending invitation for an address,
-- or NULL when there is none.
CREATE OR REPLACE FUNCTION public.pending_invitation_tenant(p_email TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ti.tenant_id
    FROM tenant_invitations ti
   WHERE LOWER(ti.email) = LOWER(p_email)
     AND ti.status = 'pending'
     AND ti.accepted_at IS NULL
     AND ti.expires_at > NOW()
   ORDER BY ti.created_at DESC
   LIMIT 1
$$;

COMMENT ON FUNCTION public.pending_invitation_tenant(TEXT) IS
  'Tenant of the newest pending, unexpired invitation for an email, else NULL. '
  'Used by handle_new_user_signup to tell an invitee from an ordinary signup.';

-- A function in `public` is published by PostgREST as an RPC, and CREATE
-- FUNCTION grants EXECUTE to PUBLIC by default. Left alone, this one would let
-- anyone POST /rpc/pending_invitation_tenant and ask "has this address been
-- invited, and to which company?" — an email oracle returning a tenant id.
-- Only the SECURITY DEFINER trigger needs it, and that runs as the owner.
REVOKE ALL ON FUNCTION public.pending_invitation_tenant(TEXT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.pending_invitation_tenant(TEXT) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.pending_invitation_tenant(TEXT) FROM authenticated;
  END IF;
END $$;

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
    -- token, and sets company_name and role on this profile from the
    -- invitation it verified.
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

  -- ---- ordinary signup: 343's body, unchanged --------------------------
  v_company_name := COALESCE(
    NEW.raw_user_meta_data->>'company_name',
    SPLIT_PART(NEW.email, '@', 1) || '''s Company'
  );

  INSERT INTO tenants (company_name, contact_email)
  VALUES (v_company_name, NEW.email)
  RETURNING id INTO v_tenant_id;

  INSERT INTO tenant_members (tenant_id, user_id, role, status, joined_at)
  VALUES (v_tenant_id, NEW.id, 'owner', 'active', NOW());

  -- role='admin': the signup creator owns the tenant they just created (227).
  INSERT INTO user_profiles (id, email, full_name, company_name, is_active, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), v_company_name, true, 'admin')
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

-- ============================================================================
-- Post-checks, inside the transaction: a wrong gate here means either invitees
-- keep getting their own company, or — far worse — ordinary signups stop
-- getting one. Both are proved before this commits.
-- ============================================================================

-- The trigger must still be attached. CREATE OR REPLACE FUNCTION does not
-- touch it, but a rename or a dropped trigger would make all of this dead code.
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

-- Nobody but the owner may call the invitation lookup: as an exposed RPC it
-- would answer "is this address invited, and where?" for any address.
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
       AND has_function_privilege(r, 'public.pending_invitation_tenant(text)', 'EXECUTE')
    THEN
      RAISE EXCEPTION '% can still execute pending_invitation_tenant', r;
    END IF;
  END LOOP;
END $$;

-- Exercise the invitation half of the gate against real rows, then roll them
-- back. The BEGIN/EXCEPTION block is a subtransaction: raising inside it
-- discards the probe rows and nothing else.
DO $$
DECLARE
  v_owner   UUID;
  v_tenant  UUID;
  v_probe   TEXT := 'migration-356-probe@example.invalid';
  v_got     UUID;
  v_failure TEXT;
BEGIN
  -- invited_by is NOT NULL and references auth.users, so the probe needs a
  -- real user to borrow. On a brand-new database there is none; skip rather
  -- than fail, the checks above still stand.
  SELECT id INTO v_owner FROM auth.users LIMIT 1;
  IF v_owner IS NULL THEN
    RAISE NOTICE '[356] no auth.users row to borrow — invitation probe skipped';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO tenants (company_name, contact_email)
    VALUES ('Migration 356 Probe', v_probe)
    RETURNING id INTO v_tenant;

    -- 1. a pending, unexpired invitation IS found
    INSERT INTO tenant_invitations
      (tenant_id, email, role, invited_by, invitation_token, status, expires_at)
    VALUES
      (v_tenant, v_probe, 'member', v_owner, 'probe-356-pending', 'pending', NOW() + INTERVAL '1 day');

    v_got := public.pending_invitation_tenant(v_probe);
    IF v_got IS DISTINCT FROM v_tenant THEN
      v_failure := format('pending invitation not found (got %s, want %s)', v_got, v_tenant);
      RAISE EXCEPTION 'probe_356_rollback';
    END IF;

    -- 2. matching is case-insensitive, since the app lowercases on write
    --    but an auth email may arrive in any case
    IF public.pending_invitation_tenant(UPPER(v_probe)) IS DISTINCT FROM v_tenant THEN
      v_failure := 'invitation lookup is case-sensitive';
      RAISE EXCEPTION 'probe_356_rollback';
    END IF;

    -- 3. an EXPIRED invitation is not a licence to skip tenant creation
    UPDATE tenant_invitations SET expires_at = NOW() - INTERVAL '1 day'
     WHERE invitation_token = 'probe-356-pending';
    IF public.pending_invitation_tenant(v_probe) IS NOT NULL THEN
      v_failure := 'expired invitation still counts as pending';
      RAISE EXCEPTION 'probe_356_rollback';
    END IF;

    -- 4. nor is an already-accepted one
    UPDATE tenant_invitations
       SET expires_at = NOW() + INTERVAL '1 day', status = 'accepted', accepted_at = NOW()
     WHERE invitation_token = 'probe-356-pending';
    IF public.pending_invitation_tenant(v_probe) IS NOT NULL THEN
      v_failure := 'accepted invitation still counts as pending';
      RAISE EXCEPTION 'probe_356_rollback';
    END IF;

    -- 5. an address nobody invited gets NULL — the ordinary-signup path
    IF public.pending_invitation_tenant('nobody-invited-356@example.invalid') IS NOT NULL THEN
      v_failure := 'uninvited address matched an invitation';
      RAISE EXCEPTION 'probe_356_rollback';
    END IF;

    -- All five held. Unwind the probe rows.
    v_failure := NULL;
    RAISE EXCEPTION 'probe_356_rollback';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'probe_356_rollback' THEN
        RAISE;
      END IF;
      IF v_failure IS NOT NULL THEN
        RAISE EXCEPTION '[356] gate probe failed: %', v_failure;
      END IF;
      RAISE NOTICE '[356] invitation gate probe passed (5 checks)';
  END;
END $$;

COMMIT;
