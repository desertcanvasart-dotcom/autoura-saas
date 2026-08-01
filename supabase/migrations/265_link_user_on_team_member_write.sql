-- =====================================================================
-- 265 — link directory rows written AFTER migration 264
-- =====================================================================
-- 264 linked team_members to auth users at two moments: the one-time
-- backfill, and whenever a tenant_members row is inserted. Gap found
-- verifying on a tenant with an empty directory: a team_members row
-- created after 264 for a person who ALREADY has a login never links —
-- their tenant_members insert happened long ago, and nothing looks the
-- other way. Any tenant that starts using the directory post-264 would
-- never get a single link.
--
-- Fix: BEFORE INSERT (and BEFORE UPDATE OF email) trigger on
-- team_members that resolves user_id from the tenant's memberships by
-- email. BEFORE, so it sets NEW.user_id without a self-UPDATE. Same
-- warn-and-continue contract as 264: directory writes must never fail
-- because linking hiccuped. auth.users is the email authority (every
-- login has a row there; user_profiles arrives later on some paths).
-- =====================================================================

CREATE OR REPLACE FUNCTION link_user_on_team_member_write()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NEW.email IS NULL OR NEW.user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT tm.user_id
    INTO v_user_id
    FROM tenant_members tm
    JOIN auth.users au ON au.id = tm.user_id
   WHERE tm.tenant_id = NEW.tenant_id
     AND LOWER(au.email) = LOWER(NEW.email)
   LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    NEW.user_id := v_user_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'link_user_on_team_member_write failed for % (tenant %): %',
    NEW.email, NEW.tenant_id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_link_user_on_team_member ON team_members;
CREATE TRIGGER trg_link_user_on_team_member
  BEFORE INSERT OR UPDATE OF email ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION link_user_on_team_member_write();
