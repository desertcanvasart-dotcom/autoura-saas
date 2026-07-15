-- =====================================================================
-- Migration 226: auth.users FK sweep (unblock permanent user deletion)
-- =====================================================================
-- Super-admin gains a permanent user delete (auth.admin.deleteUser).
-- user_profiles and tenant_members already cascade from auth.users, but
-- several audit/attribution columns reference auth.users(id) with NO
-- delete action, so deleting a user who ever created/invited anything
-- fails with FK violations. Observed offenders: tenant_members.invited_by
-- (002), scheduled_sends.created_by (023), team invitations invited_by
-- (030, NOT NULL), template last_modified_by (021), tour_departures /
-- operator_capacity created_by (127/128).
--
-- Defensive sweep, same pattern as migration 225: walk pg_constraint for
-- every single-column public-schema FK referencing auth.users whose
-- delete rule is NO ACTION/RESTRICT and convert it:
--   - nullable column  -> ON DELETE SET NULL  (record outlives its author)
--   - NOT NULL column  -> ON DELETE CASCADE   (row is meaningless without it)
-- Existing SET NULL / CASCADE rules are left untouched. Idempotent.
-- =====================================================================

DO $$
DECLARE
  r RECORD;
  new_rule TEXT;
BEGIN
  FOR r IN
    SELECT
      con.conname,
      con.conrelid::regclass AS tbl,
      att.attname AS col,
      att.attnotnull AS not_null
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    JOIN pg_namespace nsp ON nsp.oid = con.connamespace
    WHERE con.contype = 'f'
      AND con.confrelid = 'auth.users'::regclass
      AND con.confdeltype IN ('a', 'r')   -- NO ACTION / RESTRICT
      AND array_length(con.conkey, 1) = 1
      AND nsp.nspname = 'public'
  LOOP
    new_rule := CASE WHEN r.not_null THEN 'CASCADE' ELSE 'SET NULL' END;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE %s',
      r.tbl, r.conname, r.col, new_rule
    );
    RAISE NOTICE 'auth.users FK %.% (%) -> ON DELETE %', r.tbl, r.col, r.conname, new_rule;
  END LOOP;
END $$;
