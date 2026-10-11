-- ============================================================================
-- 410 — a team member's role may be any job title the Team Members page offers
-- ============================================================================
--
-- team_members.role was declared CHECK (role IN ('owner','manager','agent',
-- 'staff','viewer')) in migration 008 and never revised, while the Team
-- Members page offers Coordinator, Sales, Tour Guide and Driver too. Adding a
-- member as a Driver failed on the constraint (and the page said nothing), and
-- the WhatsApp "Manage Agents" add, which defaults to 'sales', failed the same
-- way.
--
-- The role here is a JOB TITLE in the staff directory, not a login role — the
-- login's permissions live on tenant_members. Widening the set loses nothing:
-- every row that satisfies the old check satisfies the new one.
--
-- The old constraint is found by its column, not its name. Idempotent.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  c TEXT;
BEGIN
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.conrelid = 'team_members'::regclass
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%role%'
       AND pg_get_constraintdef(con.oid) NOT ILIKE '%staff_type%'
  LOOP
    EXECUTE format('ALTER TABLE team_members DROP CONSTRAINT %I', c);
    RAISE NOTICE '[410] dropped % on team_members', c;
  END LOOP;
END $$;

ALTER TABLE team_members
  ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('owner', 'manager', 'coordinator', 'sales', 'guide', 'driver', 'agent', 'staff', 'viewer'));

COMMIT;
