-- =====================================================================
-- 264 — link team_members to login accounts
-- =====================================================================
-- team_members (the staff directory that task assignment, WhatsApp agent
-- assignment, and notifications reference) had no connection to auth
-- users: the same person existed twice — once as a directory row, once
-- as a login — and the records drifted (different emails, one
-- deactivated but not the other).
--
-- Three parts:
--   1. team_members.user_id — nullable FK to auth.users. Nullable is the
--      point: plenty of directory people (drivers, freelance guides)
--      never get a login.
--   2. Backfill — link existing rows by (tenant, email) where that user
--      really is a member of that tenant.
--   3. Trigger on tenant_members INSERT — every future login user of a
--      tenant gets linked (or added) in the directory automatically,
--      regardless of which app path created the membership (self-serve
--      signup trigger, invitation acceptance, admin action).
--
-- Trigger design notes:
--   - handle_new_user_signup (262) inserts tenant_members BEFORE
--     user_profiles, so the function falls back to auth.users for the
--     email/name when the profile row does not exist yet.
--   - The whole body is wrapped in WARN-and-continue: directory linking
--     must never abort a signup or membership insert (the 228/262
--     lineage is the cautionary tale).
--   - ON CONFLICT targets the real UNIQUE(tenant_id, email) constraint
--     from 008 — not a partial index (the gmail-chain gotcha).
--   - Access roles map to directory job roles conservatively:
--     owner→owner, admin/manager→manager, everything else→staff.
-- =====================================================================

-- 1. Column + lookup indexes
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Backfill before the unique index so a pre-existing duplicate email
--    cannot collide with a trigger-created row later.
UPDATE team_members tm
SET user_id = tmem.user_id
FROM tenant_members tmem
JOIN user_profiles up ON up.id = tmem.user_id
WHERE tm.user_id IS NULL
  AND tm.tenant_id = tmem.tenant_id
  AND tm.email IS NOT NULL
  AND LOWER(tm.email) = LOWER(up.email);

-- One directory row per login per tenant (unlinked rows unconstrained).
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_tenant_user
  ON team_members (tenant_id, user_id)
  WHERE user_id IS NOT NULL;

-- 3. Keep the link maintained going forward
CREATE OR REPLACE FUNCTION link_team_member_on_membership()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_name TEXT;
BEGIN
  SELECT up.email, up.full_name
    INTO v_email, v_name
    FROM user_profiles up
   WHERE up.id = NEW.user_id;

  -- Signup trigger inserts tenant_members before user_profiles; the auth
  -- row always exists by now.
  IF v_email IS NULL THEN
    SELECT au.email,
           COALESCE(au.raw_user_meta_data->>'full_name', SPLIT_PART(au.email, '@', 1))
      INTO v_email, v_name
      FROM auth.users au
     WHERE au.id = NEW.user_id;
  END IF;

  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO team_members (tenant_id, name, email, role, user_id)
  VALUES (
    NEW.tenant_id,
    COALESCE(NULLIF(v_name, ''), SPLIT_PART(v_email, '@', 1)),
    v_email,
    CASE NEW.role
      WHEN 'owner'   THEN 'owner'
      WHEN 'admin'   THEN 'manager'
      WHEN 'manager' THEN 'manager'
      ELSE 'staff'
    END,
    NEW.user_id
  )
  ON CONFLICT (tenant_id, email) DO UPDATE SET user_id = EXCLUDED.user_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let directory bookkeeping abort a signup / membership insert.
  RAISE WARNING 'link_team_member_on_membership failed for user % tenant %: %',
    NEW.user_id, NEW.tenant_id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_link_team_member ON tenant_members;
CREATE TRIGGER trg_link_team_member
  AFTER INSERT ON tenant_members
  FOR EACH ROW
  EXECUTE FUNCTION link_team_member_on_membership();
