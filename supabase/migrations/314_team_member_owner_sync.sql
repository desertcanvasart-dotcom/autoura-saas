-- ============================================================================
-- 314 — the owner is not "Staff": sync team_members.role from tenant_members
-- ============================================================================
-- GET-M06: User Management showed the account as Owner while Team Members
-- listed the same person as "Staff" and reported Owners: 0. The two
-- people-systems disagree because tenant_members (the permission authority)
-- says owner while the team_members staff profile defaulted to 'staff' at
-- creation and nothing ever synced it.
--
-- Permissions were never wrong — TenantContext reads tenant_members — but
-- ownership REPORTING was, and the team page's role vocabulary includes
-- 'owner', so the display row should say it.
--
-- One-way sync, owners only: a team_members row linked (by user_id) to a
-- tenant_members owner of the SAME tenant gets role 'owner'. Nothing else is
-- touched; demotion is out of scope (removing ownership already goes through
-- tenant_members, and a follow-up sync can widen this if wanted).

BEGIN;

UPDATE team_members tm
SET role = 'owner', updated_at = now()
FROM tenant_members mem
WHERE mem.user_id = tm.user_id
  AND mem.tenant_id = tm.tenant_id
  AND mem.role = 'owner'
  AND tm.role IS DISTINCT FROM 'owner';

COMMIT;
