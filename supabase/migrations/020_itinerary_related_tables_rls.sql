-- =====================================================================
-- Migration 020: Itinerary Related Tables - Add Multi-Tenancy & RLS
-- Description: Adds tenant_id and RLS to itinerary_days and itinerary_services
-- Date: 2026-01-23
-- =====================================================================

-- =====================================================================
-- 1. ADD TENANT_ID TO ITINERARY_DAYS
-- =====================================================================

-- Add tenant_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'itinerary_days' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE itinerary_days ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Populate tenant_id from parent itinerary
UPDATE itinerary_days
SET tenant_id = (
  SELECT tenant_id
  FROM itineraries
  WHERE itineraries.id = itinerary_days.itinerary_id
)
WHERE tenant_id IS NULL;

-- Make tenant_id required
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'itinerary_days'
    AND column_name = 'tenant_id'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE itinerary_days ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;

-- Create index
CREATE INDEX IF NOT EXISTS idx_itinerary_days_tenant ON itinerary_days(tenant_id);

-- Enable RLS
ALTER TABLE itinerary_days ENABLE ROW LEVEL SECURITY;

-- RLS Policies for itinerary_days
CREATE POLICY "Users can view tenant itinerary_days" ON itinerary_days
  FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can create itinerary_days" ON itinerary_days
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can update itinerary_days" ON itinerary_days
  FOR UPDATE USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Managers can delete itinerary_days" ON itinerary_days
  FOR DELETE USING (
    tenant_id = get_user_tenant_id()
    AND user_has_role('manager')
  );

-- Auto-populate tenant_id trigger
CREATE OR REPLACE FUNCTION auto_populate_itinerary_day_tenant()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := (
      SELECT tenant_id
      FROM itineraries
      WHERE id = NEW.itinerary_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_populate_itinerary_days_tenant_id
  BEFORE INSERT ON itinerary_days
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION auto_populate_itinerary_day_tenant();

-- =====================================================================
-- 2. ADD TENANT_ID TO ITINERARY_SERVICES
-- =====================================================================

-- Add tenant_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'itinerary_services' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE itinerary_services ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Populate tenant_id from parent itinerary
UPDATE itinerary_services
SET tenant_id = (
  SELECT tenant_id
  FROM itineraries
  WHERE itineraries.id = itinerary_services.itinerary_id
)
WHERE tenant_id IS NULL;

-- Make tenant_id required
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'itinerary_services'
    AND column_name = 'tenant_id'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE itinerary_services ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;

-- Create index
CREATE INDEX IF NOT EXISTS idx_itinerary_services_tenant ON itinerary_services(tenant_id);

-- Enable RLS
ALTER TABLE itinerary_services ENABLE ROW LEVEL SECURITY;

-- RLS Policies for itinerary_services
CREATE POLICY "Users can view tenant itinerary_services" ON itinerary_services
  FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can create itinerary_services" ON itinerary_services
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can update itinerary_services" ON itinerary_services
  FOR UPDATE USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Managers can delete itinerary_services" ON itinerary_services
  FOR DELETE USING (
    tenant_id = get_user_tenant_id()
    AND user_has_role('manager')
  );

-- Auto-populate tenant_id trigger
CREATE OR REPLACE FUNCTION auto_populate_itinerary_service_tenant()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := (
      SELECT tenant_id
      FROM itineraries
      WHERE id = NEW.itinerary_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_populate_itinerary_services_tenant_id
  BEFORE INSERT ON itinerary_services
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION auto_populate_itinerary_service_tenant();

-- =====================================================================
-- SUMMARY
-- =====================================================================

-- Migration 020 Completed:
-- ✅ itinerary_days table - Added tenant_id, RLS, 4 policies, trigger, index
-- ✅ itinerary_services table - Added tenant_id, RLS, 4 policies, trigger, index
--
-- Security Features:
-- ✅ tenant_id NOT NULL with FK to tenants
-- ✅ RLS enabled on both tables
-- ✅ 8 RLS policies total (4 per table)
-- ✅ 2 auto-populate triggers
-- ✅ 2 performance indexes
-- ✅ Existing data migrated with tenant_id from parent itineraries
