-- ============================================================================
-- 407 — people deactivated under the old account-wide rule become
--       deactivated per company
-- ============================================================================
-- Before migration 406 / documents audit round 12, "Deactivate" on the Team
-- page wrote user_profiles.is_active = false: the account-wide flag that
-- middleware enforces, so the person was locked out of every company they
-- belong to — and only a super admin could switch it back. Deactivation now
-- lives on the company's tenant_members row (lib/member-status.ts).
--
-- Who is converted: profiles switched off WITHOUT an auth ban. A super
-- admin's "disable" (app/api/super-admin/users/[id]) bans the login as well
-- as clearing the flag; those are platform decisions and are left alone. The
-- Team page never banned anyone.
--
-- What changes: each such person's ACTIVE memberships become 'deactivated',
-- and the account flag is switched back on. Nobody gains access: they were
-- locked out of every company and stay locked out of every company. The old
-- rule never recorded WHICH company deactivated them, so every company is
-- marked — and any of them can now reactivate the person from its own Users
-- page, which before needed a super admin.
--
-- Requires 406 ('deactivated' in the status CHECK). Replay-safe: a converted
-- profile is active again, so a second run finds nobody.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _old_deactivated ON COMMIT DROP AS
SELECT p.id
FROM public.user_profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.is_active = false
  AND (u.banned_until IS NULL OR u.banned_until <= now());

UPDATE public.tenant_members m
SET status = 'deactivated'
WHERE m.user_id IN (SELECT id FROM _old_deactivated)
  AND m.status = 'active';

UPDATE public.user_profiles p
SET is_active = true
WHERE p.id IN (SELECT id FROM _old_deactivated);

COMMIT;
