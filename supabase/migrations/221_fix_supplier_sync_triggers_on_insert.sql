-- =====================================================
-- Migration 221: fix supplier type/status sync on INSERT
-- =====================================================
-- Migration 010 added BEFORE INSERT OR UPDATE triggers to keep the duplicated
-- columns in sync — type <-> supplier_type and status <-> is_active. But the
-- conditions use `NEW.x != OLD.x`, and on INSERT `OLD` is NULL, so
-- `NEW.x != NULL` evaluates to NULL (not TRUE) and the sync body is skipped.
--
-- Consequence: a row inserted with only `type` set (e.g. the guides API inserts
-- type='guide') never gets supplier_type populated, and the guides list — which
-- filters `supplier_type = 'guide'` — never returns it. Same hole for
-- status/is_active on insert.
--
-- Fix: use `IS DISTINCT FROM`, which treats NULL correctly — on INSERT it is
-- TRUE when the source column is set, so the mirror column is populated.

CREATE OR REPLACE FUNCTION sync_supplier_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type IS NOT NULL AND NEW.type IS DISTINCT FROM OLD.type THEN
    NEW.supplier_type := NEW.type;
  END IF;

  IF NEW.supplier_type IS NOT NULL AND NEW.supplier_type IS DISTINCT FROM OLD.supplier_type THEN
    NEW.type := NEW.supplier_type;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_supplier_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.is_active := (NEW.status = 'active');
  END IF;

  IF NEW.is_active IS NOT NULL AND NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    NEW.status := CASE WHEN NEW.is_active THEN 'active' ELSE 'inactive' END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers themselves are unchanged (still BEFORE INSERT OR UPDATE from mig 010);
-- only the functions are redefined.

-- Backfill rows that were inserted before this fix and never got the mirror set.
UPDATE suppliers SET supplier_type = type
  WHERE supplier_type IS NULL AND type IS NOT NULL;
UPDATE suppliers SET type = supplier_type
  WHERE type IS NULL AND supplier_type IS NOT NULL;
