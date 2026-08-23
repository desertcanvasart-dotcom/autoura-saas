-- ============================================================================
-- Check 14 — triggers that exist in production and in no migration
-- ============================================================================
-- Run:  psql "$DB_URL" -f scripts/sql-checks/check-14-unversioned-triggers.sql
--
-- The hardest defect of the Travel Ops Pro audit was a trigger present in the
-- production database and in no file anywhere: every trip created from a
-- client's page arrived unlinked because the trigger overwrote the client with
-- NULL. It cannot be found by reading the repository.
--
-- Output is the full live inventory. Diff it against the repo's declared set
-- (scripts/sql-checks/expected-triggers.tsv) — anything live but not declared
-- is unversioned and worth reading closely.
-- ============================================================================

\pset format unaligned
\pset fieldsep '\t'
\pset tuples_only on

SELECT
  c.relname   AS table_name,
  t.tgname    AS trigger_name,
  CASE t.tgenabled WHEN 'O' THEN 'enabled'
                   WHEN 'D' THEN 'DISABLED'
                   WHEN 'R' THEN 'replica'
                   WHEN 'A' THEN 'always' END AS status,
  p.proname   AS function_name
FROM pg_trigger t
JOIN pg_class c   ON c.oid = t.tgrelid
JOIN pg_proc  p   ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND c.relnamespace = 'public'::regnamespace
ORDER BY c.relname, t.tgname;
