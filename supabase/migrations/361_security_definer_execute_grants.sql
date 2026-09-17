-- ============================================================================
-- 361 — Privileged functions that take a tenant or quote id are server-only
-- ============================================================================
--
-- Verified on production 2026-09-17: the ANON role — the public key shipped in
-- every browser bundle — could EXECUTE these SECURITY DEFINER functions
-- through PostgREST's /rest/v1/rpc. Each takes the tenant (or quote) id as a
-- plain argument and runs with the definer's privileges, bypassing RLS, with
-- no check that the caller belongs to that tenant. Proven with a read-only
-- anon call of get_tenant_subscription against the sandbox tenant: Postgres
-- executed the body (it then failed on a long-dropped column).
--
--   get_tenant_agent_memories  — reads another agency's AI notes on its clients
--   revert_b2b/b2c_quote_to_version — overwrites any quote from a stored version
--   create_b2b/b2c_quote_version    — writes version rows for any quote
--   increment_usage            — inflates any tenant's usage, and usage limits
--                                fail CLOSED on a measured over-limit
--   log_activity               — forges audit rows into any tenant
--   seed_tenant_vocabulary     — re-inserts preset entries into any tenant
--   get_tenant_subscription    — reads any tenant's plan (body is broken today)
--   purge_expired_agent_memories — no argument, but a delete anyone could run
--
-- Why the grants were there: Postgres gives PUBLIC execute on every new
-- function, and Supabase's default privileges add explicit grants to anon and
-- authenticated on top. Migration 267 already closed this for
-- increment_activity_minutes; these were never swept.
--
-- WHO STILL CALLS THEM, AND HOW (same PR moves the three user-session callers)
--
--   * log_activity, increment_usage, get_tenant_agent_memories were called on
--     the signed-in user's client. lib/billing-middleware.ts,
--     lib/usage-enforcement.ts and lib/agent-memory.ts now call them on the
--     service-role client; the tenant id they pass always comes from
--     requireAuth(), never from the request body.
--   * create/revert quote versions: already the admin client
--     (app/api/quotes/b2x/[id]/route.ts, .../versions/revert/route.ts).
--   * purge_expired_agent_memories: the cron, on the admin client.
--   * seed_tenant_vocabulary: only other SQL calls it (the tenants INSERT
--     trigger and migrations), which run as the definer — unaffected.
--   * get_tenant_subscription: nothing calls it.
--
-- next_supplier_invoice_reference() keeps its authenticated grant (216) but
-- loses anon: an anonymous caller could burn invoice sequence numbers.
--
-- Guarded on each function existing (to_regprocedure returns NULL instead of
-- raising), so a database missing one of them still applies this cleanly.
-- Idempotent: REVOKE/GRANT of an already-absent/present privilege is a no-op.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.get_tenant_agent_memories(uuid, uuid, text, double precision, integer)',
    'public.revert_b2b_quote_to_version(uuid, integer, uuid, text)',
    'public.revert_b2c_quote_to_version(uuid, integer, uuid, text)',
    'public.create_b2b_quote_version(uuid, uuid, text)',
    'public.create_b2c_quote_version(uuid, uuid, text)',
    'public.increment_usage(uuid, character varying, integer, timestamp with time zone, timestamp with time zone)',
    'public.log_activity(uuid, uuid, character varying, character varying, uuid, jsonb, inet, text)',
    'public.seed_tenant_vocabulary(uuid, text)',
    'public.get_tenant_subscription(uuid)',
    'public.purge_expired_agent_memories()'
  ] LOOP
    IF to_regprocedure(sig) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
      -- Explicit, so a later default-privileges change cannot silently take
      -- the one intended caller's access away.
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    END IF;
  END LOOP;

  IF to_regprocedure('public.next_supplier_invoice_reference()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.next_supplier_invoice_reference() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.next_supplier_invoice_reference() TO authenticated, service_role;
  END IF;
END
$$;

COMMIT;
