-- ============================================
-- 457: staff see their own tasks and follow-ups
-- ============================================
-- The brief: "Staff see their own follow-ups and assigned tasks". Until now
-- every member of a company read every task and follow-up. A hidden list is
-- not a lock — the browser holds the user's own Supabase session, and the
-- Follow-ups list reads client_followups straight through PostgREST — so the
-- rule lives here, as RESTRICTIVE policies (ANDed with the existing
-- company-only ones, the 424 pattern).
--
-- Who it limits: a login whose role in the ROW's company is 'member' (staff).
-- Owners, admins and managers see everything, as before; viewers keep their
-- read-only view (they have no Tasks page). The service role bypasses RLS,
-- so the task generator, reminders and other server jobs are unaffected.
--
-- What staff see (operator, 2026-10-31: "own + unassigned"):
--   tasks            — assigned to their staff-directory entry (logins are
--                      linked to it automatically, 264), or to no one.
--   client_followups — assigned to them, created by them, or to no one.
--
-- A follow-up never recorded its creator (the add form sent neither column),
-- so created_by now defaults to the caller. Existing rows have no assignee
-- and so stay visible to everyone until someone is assigned.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_staff_member(p_tenant UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tenant_members
    WHERE user_id = auth.uid()
      AND tenant_id = p_tenant
      AND status = 'active'
      AND role = 'member'
  )
$$;

COMMENT ON FUNCTION public.is_staff_member(UUID) IS
  'True when the caller is an active member-role (staff) login of the given company (migration 457).';

REVOKE ALL ON FUNCTION public.is_staff_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff_member(UUID) TO authenticated;

-- Tasks: assignee is a staff-directory row (team_members), linked to a login
-- through team_members.user_id.
DROP POLICY IF EXISTS "Staff read own or unassigned tasks" ON tasks;
CREATE POLICY "Staff read own or unassigned tasks" ON tasks
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    NOT public.is_staff_member(tenant_id)
    OR assigned_to IS NULL
    OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = tasks.assigned_to AND tm.user_id = auth.uid())
  );

-- Changing a task needs the same reach, before and after: staff work their
-- own tasks; handing one to someone else is a manager's call (the app reads
-- the row back after a change, which staff could not once it left them).
DROP POLICY IF EXISTS "Staff change own or unassigned tasks" ON tasks;
CREATE POLICY "Staff change own or unassigned tasks" ON tasks
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    NOT public.is_staff_member(tenant_id)
    OR assigned_to IS NULL
    OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = tasks.assigned_to AND tm.user_id = auth.uid())
  )
  WITH CHECK (
    NOT public.is_staff_member(tenant_id)
    OR assigned_to IS NULL
    OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = tasks.assigned_to AND tm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Staff delete own or unassigned tasks" ON tasks;
CREATE POLICY "Staff delete own or unassigned tasks" ON tasks
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    NOT public.is_staff_member(tenant_id)
    OR assigned_to IS NULL
    OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = tasks.assigned_to AND tm.user_id = auth.uid())
  );

-- Follow-ups: assignee and creator are logins.
ALTER TABLE client_followups ALTER COLUMN created_by SET DEFAULT auth.uid();

DROP POLICY IF EXISTS "Staff read own or unassigned follow-ups" ON client_followups;
CREATE POLICY "Staff read own or unassigned follow-ups" ON client_followups
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    NOT public.is_staff_member(tenant_id)
    OR assigned_to IS NULL
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Staff change own or unassigned follow-ups" ON client_followups;
CREATE POLICY "Staff change own or unassigned follow-ups" ON client_followups
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    NOT public.is_staff_member(tenant_id)
    OR assigned_to IS NULL
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
  )
  WITH CHECK (
    NOT public.is_staff_member(tenant_id)
    OR assigned_to IS NULL
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Staff delete own or unassigned follow-ups" ON client_followups;
CREATE POLICY "Staff delete own or unassigned follow-ups" ON client_followups
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    NOT public.is_staff_member(tenant_id)
    OR assigned_to IS NULL
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
  );

COMMIT;
