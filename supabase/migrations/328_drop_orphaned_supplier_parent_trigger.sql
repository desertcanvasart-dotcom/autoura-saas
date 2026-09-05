-- Migration 328: Drop the orphaned parent-tenant trigger on suppliers
--
-- Migration 311 moved supplier properties to their own table and DROPPED
-- suppliers.parent_supplier_id — but left migration 009's
-- validate_supplier_parent_tenant_trigger in place. Its function reads
-- NEW.parent_supplier_id on EVERY suppliers INSERT/UPDATE, so every
-- supplier write since 311 failed with:
--   record "new" has no field "parent_supplier_id"
-- (surfaced by the first real CSV import, 2026-09-05).
--
-- Note this trigger exists only on databases that ran 009 AFTER 010 added
-- the column (009 guards on the column existing) — i.e. prod's lived
-- history. A from-scratch install never creates it, which is why the
-- replay test alone could not reproduce the failure; its suppliers write
-- probe now guards the class regardless.
--
-- Idempotent: both drops are IF EXISTS.

DROP TRIGGER IF EXISTS validate_supplier_parent_tenant_trigger ON suppliers;
DROP FUNCTION IF EXISTS validate_supplier_parent_tenant();
