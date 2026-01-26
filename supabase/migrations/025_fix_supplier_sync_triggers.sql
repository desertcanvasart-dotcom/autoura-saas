-- ============================================
-- MIGRATION 025: FIX SUPPLIER SYNC TRIGGERS
-- ============================================
-- Fixes sync triggers that reference OLD on INSERT (which causes errors)
-- Created: 2026-01-25
-- ============================================

-- The original triggers use OLD.column which doesn't exist on INSERT
-- This causes "record 'old' is not assigned yet" errors

-- =====================================================================
-- 1. FIX sync_supplier_name TRIGGER
-- =====================================================================

CREATE OR REPLACE FUNCTION sync_supplier_name()
RETURNS TRIGGER AS $$
BEGIN
  -- On INSERT: sync name <-> company_name
  IF TG_OP = 'INSERT' THEN
    IF NEW.name IS NOT NULL AND NEW.company_name IS NULL THEN
      NEW.company_name := NEW.name;
    ELSIF NEW.company_name IS NOT NULL AND NEW.name IS NULL THEN
      NEW.name := NEW.company_name;
    END IF;
  -- On UPDATE: only sync if the value actually changed
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.name IS DISTINCT FROM OLD.name AND NEW.name IS NOT NULL THEN
      NEW.company_name := NEW.name;
    ELSIF NEW.company_name IS DISTINCT FROM OLD.company_name AND NEW.company_name IS NOT NULL THEN
      NEW.name := NEW.company_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 2. FIX sync_supplier_type TRIGGER
-- =====================================================================

CREATE OR REPLACE FUNCTION sync_supplier_type()
RETURNS TRIGGER AS $$
BEGIN
  -- On INSERT: sync type <-> supplier_type
  IF TG_OP = 'INSERT' THEN
    IF NEW.type IS NOT NULL AND NEW.supplier_type IS NULL THEN
      NEW.supplier_type := NEW.type;
    ELSIF NEW.supplier_type IS NOT NULL AND NEW.type IS NULL THEN
      NEW.type := NEW.supplier_type;
    END IF;
  -- On UPDATE: only sync if the value actually changed
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.type IS DISTINCT FROM OLD.type AND NEW.type IS NOT NULL THEN
      NEW.supplier_type := NEW.type;
    ELSIF NEW.supplier_type IS DISTINCT FROM OLD.supplier_type AND NEW.supplier_type IS NOT NULL THEN
      NEW.type := NEW.supplier_type;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 3. FIX sync_supplier_status TRIGGER
-- =====================================================================

CREATE OR REPLACE FUNCTION sync_supplier_status()
RETURNS TRIGGER AS $$
BEGIN
  -- On INSERT: sync status <-> is_active
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NOT NULL AND NEW.is_active IS NULL THEN
      NEW.is_active := (NEW.status = 'active');
    ELSIF NEW.is_active IS NOT NULL AND NEW.status IS NULL THEN
      NEW.status := CASE WHEN NEW.is_active THEN 'active' ELSE 'inactive' END;
    END IF;
  -- On UPDATE: only sync if the value actually changed
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IS NOT NULL THEN
      NEW.is_active := (NEW.status = 'active');
    ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active AND NEW.is_active IS NOT NULL THEN
      NEW.status := CASE WHEN NEW.is_active THEN 'active' ELSE 'inactive' END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 025 completed: Fixed supplier sync triggers';
  RAISE NOTICE '   - sync_supplier_name now handles INSERT and UPDATE separately';
  RAISE NOTICE '   - sync_supplier_type now handles INSERT and UPDATE separately';
  RAISE NOTICE '   - sync_supplier_status now handles INSERT and UPDATE separately';
END $$;
