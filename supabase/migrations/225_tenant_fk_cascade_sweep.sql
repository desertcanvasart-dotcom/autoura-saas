-- =====================================================================
-- Migration 225: Tenant FK cascade sweep
-- =====================================================================
-- Deleting a tenants row failed with FK violations (discovered 2026-07-15
-- while wiping test tenants): most tables reference tenants(id) with
-- ON DELETE CASCADE, but a few early ALTERs added tenant_id without it —
-- observed offenders: clients (002), itineraries (001/130), b2b_partners
-- (001). Tenant data is meaningless without its tenant, so every tenant
-- FK should cascade.
--
-- Defensive sweep: instead of hardcoding the known three, walk the live
-- catalog and convert EVERY single-column FK referencing public.tenants
-- whose delete rule is not already CASCADE. Idempotent — re-running
-- finds nothing to change. Emits a NOTICE per converted constraint.
-- =====================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      con.conname,
      con.conrelid::regclass AS tbl,
      att.attname AS col
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    JOIN pg_namespace nsp ON nsp.oid = con.connamespace
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.tenants'::regclass
      AND con.confdeltype <> 'c'          -- delete rule is not CASCADE
      AND array_length(con.conkey, 1) = 1 -- tenant FKs are single-column
      AND nsp.nspname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.tenants(id) ON DELETE CASCADE',
      r.tbl, r.conname, r.col
    );
    RAISE NOTICE 'converted to ON DELETE CASCADE: %.% (constraint %)', r.tbl, r.col, r.conname;
  END LOOP;
END $$;
