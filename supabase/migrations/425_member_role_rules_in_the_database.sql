-- ============================================
-- 425: the team's role rules hold in the database too
-- ============================================
-- "Admins can manage members" (002) is FOR ALL with no rule about WHICH
-- changes: through PostgREST an admin could make themselves owner, demote or
-- remove the owner, or add anyone to the company. The API enforces the rules
-- (lib/member-role.ts: owners and admins change roles, only an owner makes,
-- changes or removes an owner, nobody changes or removes themselves); this
-- trigger enforces the same ones for a signed-in caller writing directly.
--
-- Memberships are created server-side (the invitation accept route and the
-- signup trigger), so a signed-in caller cannot insert one at all. The
-- service role and SECURITY DEFINER functions are not 'authenticated' and
-- pass untouched.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_tenant_member_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- Same test as 412/420/423: only a signed-in caller writing directly.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Team members join through an invitation' USING ERRCODE = '42501';
  END IF;

  -- Readable under 390's "Users can view their own memberships".
  SELECT role INTO caller_role
  FROM tenant_members
  WHERE user_id = auth.uid() AND tenant_id = OLD.tenant_id AND status = 'active'
  LIMIT 1;

  IF caller_role IS NULL OR caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only owners and admins can change the team' USING ERRCODE = '42501';
  END IF;

  IF OLD.user_id = auth.uid() THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'You cannot remove yourself' USING ERRCODE = '42501';
    ELSIF NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'You cannot change your own role or access' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'A membership cannot be moved' USING ERRCODE = '42501';
    END IF;
    IF (OLD.role = 'owner' OR NEW.role = 'owner') AND caller_role <> 'owner'
       AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status) THEN
      RAISE EXCEPTION 'Only an owner can assign or change the owner role' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- DELETE
  IF OLD.role = 'owner' AND caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Only an owner can remove an owner' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_tenant_member_changes ON public.tenant_members;
CREATE TRIGGER trg_guard_tenant_member_changes
  BEFORE INSERT OR UPDATE OR DELETE ON public.tenant_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_member_changes();

-- Invitations: the API lets an inviter offer only roles BELOW their own
-- (app/api/invitations/route.ts), but an admin inserting directly could
-- invite an owner — and accept it with a second address.
CREATE OR REPLACE FUNCTION public.guard_tenant_invitation_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  caller_role TEXT;
  rank_of JSONB := '{"owner":5,"admin":4,"manager":3,"member":2,"viewer":1}';
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id THEN
    RETURN NEW;
  END IF;

  SELECT role INTO caller_role
  FROM tenant_members
  WHERE user_id = auth.uid() AND tenant_id = NEW.tenant_id AND status = 'active'
  LIMIT 1;

  IF caller_role IS NULL
     OR coalesce((rank_of ->> caller_role)::INT, 0) < 3
     OR coalesce((rank_of ->> NEW.role)::INT, 99) >= (rank_of ->> caller_role)::INT THEN
    RAISE EXCEPTION 'You can only invite roles below your own' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_tenant_invitation_role ON public.tenant_invitations;
CREATE TRIGGER trg_guard_tenant_invitation_role
  BEFORE INSERT OR UPDATE ON public.tenant_invitations
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_invitation_role();

COMMIT;
