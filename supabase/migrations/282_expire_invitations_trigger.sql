-- ============================================================================
-- 282 — expire stale invitations (the trigger 030 declared and never created)
-- ============================================================================
--
-- Found by check 14: trigger_expire_invitations is declared in migration 030
-- and is not live. The obvious response — create it — BREAKS INVITATIONS.
--
-- 030's version is:
--
--   AFTER INSERT OR UPDATE ON tenant_invitations
--   FOR EACH STATEMENT EXECUTE FUNCTION expire_old_invitations()
--
-- and the function UPDATEs tenant_invitations. That UPDATE is itself a
-- statement on the same table, so it fires the trigger again — and a
-- statement-level trigger fires even when it changes 0 rows, so the recursion
-- never terminates. Verified against production in a rolled-back transaction:
-- a single INSERT recursed until the stack blew and the insert FAILED.
--
-- That is almost certainly why it is not live. Anyone "fixing" the missing
-- trigger by running 030's definition would take invitations down.
--
-- ── Why it is worth having at all ───────────────────────────────────────────
-- The status column is not cosmetic. app/api/admin/tenant/invite/route.ts
-- refuses a new invitation when one already exists for that tenant+email with
-- status = 'pending':
--
--   .eq('tenant_id', tenant_id).eq('email', email).eq('status', 'pending')
--
-- With nothing ever expiring them, an invitation that lapsed months ago is
-- still 'pending', so THE PERSON CAN NEVER BE RE-INVITED. The admin sees
-- "already invited", with no way to tell that the invitation is long dead.
--
-- ── The fix ────────────────────────────────────────────────────────────────
-- pg_trigger_depth() inside the function. A WHEN clause would be the usual
-- place for this and is not allowed on statement-level triggers, so the guard
-- lives in the body: the outer statement runs at depth 1 and does the work,
-- the UPDATE's own invocation arrives at depth 2 and returns immediately.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION expire_old_invitations()
RETURNS TRIGGER AS $$
BEGIN
  -- Without this the UPDATE below re-fires this same statement trigger, which
  -- fires even for 0 rows, and recursion never ends. See the header.
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  UPDATE tenant_invitations
     SET status = 'expired', updated_at = NOW()
   WHERE status = 'pending'
     AND expires_at < NOW();

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_expire_invitations ON tenant_invitations;
CREATE TRIGGER trigger_expire_invitations
  AFTER INSERT OR UPDATE ON tenant_invitations
  FOR EACH STATEMENT
  EXECUTE FUNCTION expire_old_invitations();

-- One-off sweep: rows that lapsed while nothing was expiring them, and are
-- currently blocking those people from being re-invited.
UPDATE tenant_invitations
   SET status = 'expired', updated_at = NOW()
 WHERE status = 'pending'
   AND expires_at < NOW();

-- --------------------------------------------------------------------------
-- Post-check. Structural assertions are not enough here: 030's trigger would
-- pass every one of them and still break the table, so this WRITES a row and
-- requires it to survive.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  probe UUID := gen_random_uuid();
  a_tenant UUID;
  an_inviter UUID;
  got TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'tenant_invitations'
      AND t.tgname = 'trigger_expire_invitations' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'trigger_expire_invitations was not created';
  END IF;

  SELECT id INTO a_tenant FROM tenants LIMIT 1;
  SELECT user_id INTO an_inviter FROM tenant_members WHERE user_id IS NOT NULL LIMIT 1;

  IF a_tenant IS NULL OR an_inviter IS NULL THEN
    RAISE NOTICE 'no tenant/member to probe with — structure asserted only';
  ELSE
    -- Already stale on insert: it must come back 'expired', and the insert
    -- must not recurse.
    INSERT INTO tenant_invitations
      (id, tenant_id, email, role, invited_by, invitation_token, expires_at, status)
    VALUES (probe, a_tenant, 'zz-migration-probe@example.invalid', 'member',
            an_inviter, gen_random_uuid()::text, NOW() - interval '1 day', 'pending');

    SELECT status INTO got FROM tenant_invitations WHERE id = probe;
    DELETE FROM tenant_invitations WHERE id = probe;

    IF got IS DISTINCT FROM 'expired' THEN
      RAISE EXCEPTION 'a lapsed invitation was left as %, not expired', got;
    END IF;
    RAISE NOTICE 'probe inserted, auto-expired and removed — no recursion';
  END IF;
END $$;

COMMIT;
