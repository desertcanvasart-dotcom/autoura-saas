-- ============================================================================
-- RLS coverage — the half scripts/verify-rls.mjs structurally cannot do
-- ============================================================================
--   psql "$DB_URL" -f scripts/sql-checks/check-rls-coverage.sql
--
-- verify-rls.mjs probes every relation with the anonymous key over HTTP. That
-- answers "did rows come back", which is only meaningful for a table that HAS
-- rows: PostgREST returns `200 []` both when RLS filtered everything away and
-- when the table is simply empty. Empty relations are therefore UNVERIFIABLE
-- from there, and it used to report them as "nothing to leak yet".
--
-- That gap was not theoretical. On 2026-08-24, tenant_invitations, writing_rules
-- and content_variations were found with RLS DISABLED — tenant_invitations
-- holding invitation_token, the credential that admits someone to a tenant.
-- All three were empty, so the HTTP sweep passed them every time it ran. A row
-- written and read back with the public anon key returned the token in full.
--
-- Row counts cannot see that. Policy state can, and does not care whether the
-- table has ever held a row.
-- ============================================================================

\pset tuples_only on
\pset format unaligned

SELECT E'\n=== tables with RLS DISABLED (policies on them are inert) ===';
SELECT '  ' || relname
FROM pg_class
WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace AND NOT relrowsecurity
ORDER BY relname;

SELECT E'\n=== RLS enabled but NO policy (denies everything — an outage, not a fix) ===';
-- notifications is deliberate: migration 268 states every reader and writer
-- uses the service-role client, so clients are meant to have no direct access.
-- Listed here it would be noise on every run, and a check that always prints
-- something known-good is one people stop reading — the ledger records a probe
-- that called 168 correct refusals "errors" and hid a real failure among them.
SELECT '  ' || c.relname
FROM pg_class c
WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace AND c.relrowsecurity
  AND c.relname NOT IN ('notifications')
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname
  )
ORDER BY c.relname;

SELECT E'\n=== views executing with OWNER privileges (they bypass RLS entirely) ===';
SELECT '  ' || relname
FROM pg_class
WHERE relkind IN ('v','m') AND relnamespace = 'public'::regnamespace
  AND NOT COALESCE(array_to_string(reloptions, ',') LIKE '%security_invoker=true%', false)
ORDER BY relname;

SELECT E'\n=== policies whose predicate does not reference the caller ===';
-- A policy that never mentions auth.uid(), get_user_tenant_id() or similar
-- cannot be scoping by caller, so it admits every role it applies to —
-- including anon. `USING (true)` restricted to service_role is fine and is
-- excluded; anything else here deserves a look.
SELECT '  ' || tablename || ' -> ' || policyname || '  roles=' || array_to_string(roles, ',')
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd IN ('SELECT','ALL')
  AND NOT (roles = ARRAY['service_role']::name[])
  AND COALESCE(qual, 'true') !~* 'auth\.uid|get_user_tenant_id|user_has_role|tenant_id|user_id|is_super'
  -- Deliberately global reference data, readable by any signed-in user:
  --   exchange_rate_snapshots  daily FX history, identical for every tenant
  --   subscription_plans       the platform's own price list
  -- Neither carries tenant data, so caller-scoping would be meaningless.
  AND (tablename, policyname) NOT IN (
    ('exchange_rate_snapshots', 'exchange_rate_snapshots_read'),
    ('subscription_plans', 'subscription_plans_read')
  )
ORDER BY tablename, policyname;

SELECT E'\n(no rows under a heading means that check is clean)\n';
