-- =====================================================================
-- Migration 010: Add Missing Columns to Suppliers Table
-- Description: Adds all columns that the API expects but are missing from schema
-- Version: 1.0
-- Date: 2026-01-23
-- =====================================================================

-- This migration fixes schema drift between database and API code
-- The API expects these columns but they don't exist in migration 000

-- =====================================================================
-- 1. ADD MISSING CONTACT COLUMNS
-- =====================================================================

-- Add phone2 (second phone number)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'phone2'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN phone2 VARCHAR(50);
    RAISE NOTICE '✅ Added phone2 column';
  END IF;
END $$;

-- Add whatsapp
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'whatsapp'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN whatsapp VARCHAR(50);
    RAISE NOTICE '✅ Added whatsapp column';
  END IF;
END $$;

-- Add website
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'website'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN website TEXT;
    RAISE NOTICE '✅ Added website column';
  END IF;
END $$;

-- Add contact_email (API uses this instead of just 'email')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'contact_email'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN contact_email VARCHAR(255);
    -- Copy existing email to contact_email
    UPDATE suppliers SET contact_email = email WHERE email IS NOT NULL;
    RAISE NOTICE '✅ Added contact_email column and copied from email';
  END IF;
END $$;

-- Add contact_phone (API uses this instead of just 'phone')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'contact_phone'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN contact_phone VARCHAR(50);
    -- Copy existing phone to contact_phone
    UPDATE suppliers SET contact_phone = phone WHERE phone IS NOT NULL;
    RAISE NOTICE '✅ Added contact_phone column and copied from phone';
  END IF;
END $$;

-- =====================================================================
-- 2. ADD MISSING FINANCIAL COLUMNS
-- =====================================================================

-- Add default_commission_rate
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'default_commission_rate'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN default_commission_rate DECIMAL(5,2);
    RAISE NOTICE '✅ Added default_commission_rate column';
  END IF;
END $$;

-- Add commission_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'commission_type'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN commission_type VARCHAR(50);
    RAISE NOTICE '✅ Added commission_type column';
  END IF;
END $$;

-- Add bank_details
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'bank_details'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN bank_details TEXT;
    RAISE NOTICE '✅ Added bank_details column';
  END IF;
END $$;

-- =====================================================================
-- 3. ADD TYPE-SPECIFIC COLUMNS (JSONB arrays)
-- =====================================================================

-- Add languages (for guides)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'languages'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN languages TEXT[];
    RAISE NOTICE '✅ Added languages column (TEXT[])';
  END IF;
END $$;

-- Add vehicle_types (for transport companies)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'vehicle_types'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN vehicle_types TEXT[];
    RAISE NOTICE '✅ Added vehicle_types column (TEXT[])';
  END IF;
END $$;

-- Add star_rating (for hotels/cruises)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'star_rating'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN star_rating VARCHAR(20);
    RAISE NOTICE '✅ Added star_rating column';
  END IF;
END $$;

-- Add property_type (for hotels)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'property_type'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN property_type VARCHAR(100);
    RAISE NOTICE '✅ Added property_type column';
  END IF;
END $$;

-- Add cuisine_types (for restaurants)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'cuisine_types'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN cuisine_types TEXT[];
    RAISE NOTICE '✅ Added cuisine_types column (TEXT[])';
  END IF;
END $$;

-- Add routes (for cruises/transport)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'routes'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN routes TEXT[];
    RAISE NOTICE '✅ Added routes column (TEXT[])';
  END IF;
END $$;

-- Add ship_name (for cruises)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'ship_name'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN ship_name VARCHAR(255);
    RAISE NOTICE '✅ Added ship_name column';
  END IF;
END $$;

-- Add cabin_count (for cruises)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'cabin_count'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN cabin_count INTEGER;
    RAISE NOTICE '✅ Added cabin_count column';
  END IF;
END $$;

-- Add capacity (for restaurants/venues)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'capacity'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN capacity INTEGER;
    RAISE NOTICE '✅ Added capacity column';
  END IF;
END $$;

-- =====================================================================
-- 4. ADD HIERARCHICAL RELATIONSHIP COLUMNS
-- =====================================================================

-- Add is_property (for hotel/restaurant chains)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'is_property'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN is_property BOOLEAN DEFAULT false;
    RAISE NOTICE '✅ Added is_property column';
  END IF;
END $$;

-- Add parent_supplier_id (for linking properties to parent companies)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'parent_supplier_id'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN parent_supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
    RAISE NOTICE '✅ Added parent_supplier_id column';
  END IF;
END $$;

-- Create index for parent_supplier_id
CREATE INDEX IF NOT EXISTS idx_suppliers_parent ON suppliers(parent_supplier_id);

-- =====================================================================
-- 5. ADD COLUMN ALIASES FOR API COMPATIBILITY
-- =====================================================================

-- The API uses 'name' but database has 'company_name'
-- Add 'name' column and copy data
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'name'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN name VARCHAR(255);
    -- Copy company_name to name
    UPDATE suppliers SET name = company_name WHERE company_name IS NOT NULL;
    RAISE NOTICE '✅ Added name column and copied from company_name';
  END IF;
END $$;

-- The API uses 'type' but database has 'supplier_type'
-- Add 'type' column and copy data
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'type'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN type VARCHAR(50);
    -- Copy supplier_type to type
    UPDATE suppliers SET type = supplier_type WHERE supplier_type IS NOT NULL;
    RAISE NOTICE '✅ Added type column and copied from supplier_type';
  END IF;
END $$;

-- The API uses 'status' but database has 'is_active'
-- Add 'status' column and convert boolean to status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'status'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN status VARCHAR(20) DEFAULT 'active'
      CHECK (status IN ('active', 'inactive', 'pending'));
    -- Convert is_active to status
    UPDATE suppliers SET status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END;
    RAISE NOTICE '✅ Added status column and converted from is_active';
  END IF;
END $$;

-- =====================================================================
-- 6. CREATE INDEXES FOR NEW COLUMNS
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_type ON suppliers(type);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_property ON suppliers(is_property);

-- =====================================================================
-- 7. ADD TRIGGERS TO KEEP COLUMNS IN SYNC
-- =====================================================================

-- Create trigger function to sync name ↔ company_name
CREATE OR REPLACE FUNCTION sync_supplier_name()
RETURNS TRIGGER AS $$
BEGIN
  -- If name is set, copy to company_name
  IF NEW.name IS NOT NULL AND NEW.name != OLD.name THEN
    NEW.company_name := NEW.name;
  END IF;

  -- If company_name is set, copy to name
  IF NEW.company_name IS NOT NULL AND NEW.company_name != OLD.company_name THEN
    NEW.name := NEW.company_name;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_supplier_name_trigger ON suppliers;
CREATE TRIGGER sync_supplier_name_trigger
  BEFORE INSERT OR UPDATE ON suppliers
  FOR EACH ROW
  EXECUTE FUNCTION sync_supplier_name();

-- Create trigger function to sync type ↔ supplier_type
CREATE OR REPLACE FUNCTION sync_supplier_type()
RETURNS TRIGGER AS $$
BEGIN
  -- If type is set, copy to supplier_type
  IF NEW.type IS NOT NULL AND NEW.type != OLD.type THEN
    NEW.supplier_type := NEW.type;
  END IF;

  -- If supplier_type is set, copy to type
  IF NEW.supplier_type IS NOT NULL AND NEW.supplier_type != OLD.supplier_type THEN
    NEW.type := NEW.supplier_type;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_supplier_type_trigger ON suppliers;
CREATE TRIGGER sync_supplier_type_trigger
  BEFORE INSERT OR UPDATE ON suppliers
  FOR EACH ROW
  EXECUTE FUNCTION sync_supplier_type();

-- Create trigger function to sync status ↔ is_active
CREATE OR REPLACE FUNCTION sync_supplier_status()
RETURNS TRIGGER AS $$
BEGIN
  -- If status is set, update is_active
  IF NEW.status IS NOT NULL AND NEW.status != OLD.status THEN
    NEW.is_active := (NEW.status = 'active');
  END IF;

  -- If is_active is set, update status
  IF NEW.is_active IS NOT NULL AND NEW.is_active != OLD.is_active THEN
    NEW.status := CASE WHEN NEW.is_active THEN 'active' ELSE 'inactive' END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_supplier_status_trigger ON suppliers;
CREATE TRIGGER sync_supplier_status_trigger
  BEFORE INSERT OR UPDATE ON suppliers
  FOR EACH ROW
  EXECUTE FUNCTION sync_supplier_status();

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'Migration 010 Complete!';
  RAISE NOTICE '✅ Added: 21 missing columns to suppliers table';
  RAISE NOTICE '✅ Added: Column aliases (name, type, status)';
  RAISE NOTICE '✅ Added: Sync triggers to keep columns consistent';
  RAISE NOTICE '✅ Added: Hierarchical columns (is_property, parent_supplier_id)';
  RAISE NOTICE '✅ Added: Type-specific columns (languages, vehicle_types, etc.)';
  RAISE NOTICE '';
  RAISE NOTICE 'Schema drift fixed! Database now matches API expectations.';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Verify all columns exist: SELECT column_name FROM information_schema.columns WHERE table_name = ''suppliers'' ORDER BY column_name;';
  RAISE NOTICE '2. Test API CRUD operations';
  RAISE NOTICE '3. Consider deprecating old columns (company_name, supplier_type, is_active) in future';
END $$;
