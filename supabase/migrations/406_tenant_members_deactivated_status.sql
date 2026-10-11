-- ============================================================================
-- 406 — a company deactivates its own staff member, not the whole account
-- ============================================================================
-- Deactivating a staff member on the Team page wrote user_profiles.is_active,
-- the account-wide flag middleware enforces — so the person was locked out of
-- every company they belong to, not just the one that deactivated them
-- (documents audit, round 12). The deactivation now lives on that company's
-- tenant_members row (lib/member-status.ts).
--
-- 'deactivated' is a status of its own, distinct from 'suspended': a super
-- admin re-activating a suspended tenant flips 'suspended' -> 'active' for
-- the whole tenant, and must not revive staff the company switched off.
--
-- Replay-safe: the CHECK is dropped and re-added with the extra value.
-- ============================================================================

BEGIN;

ALTER TABLE public.tenant_members
  DROP CONSTRAINT IF EXISTS tenant_members_status_check;

ALTER TABLE public.tenant_members
  ADD CONSTRAINT tenant_members_status_check
  CHECK (status IN ('active', 'invited', 'suspended', 'deactivated'));

COMMIT;
