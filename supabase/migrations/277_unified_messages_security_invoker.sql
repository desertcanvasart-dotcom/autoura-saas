-- ============================================================================
-- 277 — unified_messages: a view that bypasses RLS on two tenant tables
-- ============================================================================
--
-- Found 2026-08-23 auditing check 1 of the silent-failure sweep. The view is
-- owned by `postgres` and carries NO reloptions, so it executes with the
-- OWNER's privileges — the Postgres default — and silently bypasses row-level
-- security on everything beneath it. Migration 125 created it with a plain
-- `CREATE OR REPLACE VIEW`, which is exactly how the option goes missing.
--
-- What it exposes: the view UNIONs whatsapp_messages and email_messages, both
-- tenant-scoped and both RLS-protected. Through the view that protection does
-- not apply. `anon` holds SELECT on it, so an anonymous key reads every
-- tenant's message bodies, subjects, phone numbers and email addresses.
--
-- ── Why nothing caught it ───────────────────────────────────────────────────
-- scripts/verify-rls.mjs enumerates every relation and probes it with the anon
-- key — but it SKIPS any relation with zero rows ("nothing to leak yet").
-- whatsapp_messages and email_messages are both empty today, so the view
-- returns `200 []` and the sweep passed it. The exposure is armed, not firing:
-- the first synced email or WhatsApp message opens it. That gap is closed in
-- the same change (scripts/verify-rls.mjs now checks POLICY, not row count).
--
-- ── Why not DROP, as 263 did ────────────────────────────────────────────────
-- 263 deleted effective_exchange_rates on the reasoning "dead surface with a
-- leak gets deleted, not repaired", and nothing reads this view either. But
-- that view was vestigial from an abandoned approach, whereas the unified
-- inbox is live — unified_conversations has rows and 30 code references, and
-- this view is its message timeline. Repairing keeps the option; the post-check
-- below makes the repair permanent for every future view too.
-- ============================================================================

BEGIN;

-- Execute as the CALLER, so RLS on whatsapp_messages and email_messages applies.
ALTER VIEW unified_messages SET (security_invoker = true);

-- A message timeline has no anonymous use. security_invoker alone would reduce
-- this to zero rows; revoking removes the surface entirely.
REVOKE ALL ON unified_messages FROM anon;

-- --------------------------------------------------------------------------
-- Post-check: assert the fix, and generalise it — NO view in public may
-- execute with definer rights. This is the third time an owner-privilege view
-- has bypassed RLS in this project (123 → dropped in 263, and 125 → here), so
-- the invariant is asserted rather than remembered.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  offenders TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO offenders
  FROM pg_class c
  WHERE c.relkind IN ('v', 'm')
    AND c.relnamespace = 'public'::regnamespace
    AND NOT COALESCE(
      array_to_string(c.reloptions, ',') LIKE '%security_invoker=true%', false);

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'view(s) still executing with owner privileges: %', offenders;
  END IF;

  IF has_table_privilege('anon', 'public.unified_messages', 'SELECT') THEN
    RAISE EXCEPTION 'anon can still SELECT unified_messages';
  END IF;

  -- …and the app must not lose it: the unified inbox reads as an authenticated
  -- user, and RLS on the tables beneath now does the scoping.
  IF NOT has_table_privilege('authenticated', 'public.unified_messages', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated lost SELECT on unified_messages';
  END IF;
END $$;

COMMIT;
