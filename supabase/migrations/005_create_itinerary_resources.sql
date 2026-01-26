-- =====================================================================
-- Autoura: Create Itinerary Resources Table (Multi-Tenant)
-- Description: Creates itinerary_resources table with tenant isolation
-- Version: 1.0
-- Date: 2026-01-23
-- =====================================================================

-- =====================================================================
-- 1. CREATE ITINERARY_RESOURCES TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS itinerary_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenancy
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Relationships
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  itinerary_day_id UUID, -- Optional: link to specific day

  -- Resource info
  resource_type VARCHAR(50) NOT NULL
    CHECK (resource_type IN ('guide', 'vehicle', 'hotel', 'restaurant', 'cruise', 'airport_staff', 'hotel_staff')),
  resource_id UUID NOT NULL,
  resource_name VARCHAR(255),

  -- Dates
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Additional info
  notes TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,

  -- Costs
  cost_eur DECIMAL(10,2),
  cost_non_eur DECIMAL(10,2),

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'pending', 'cancelled')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 2. CREATE INDEXES
-- =====================================================================

CREATE INDEX idx_itinerary_resources_tenant
  ON itinerary_resources(tenant_id);

CREATE INDEX idx_itinerary_resources_itinerary
  ON itinerary_resources(itinerary_id);

CREATE INDEX idx_itinerary_resources_tenant_itinerary
  ON itinerary_resources(tenant_id, itinerary_id);

CREATE INDEX idx_itinerary_resources_resource
  ON itinerary_resources(resource_type, resource_id);

CREATE INDEX idx_itinerary_resources_dates
  ON itinerary_resources(start_date, end_date);

-- =====================================================================
-- 3. CREATE UPDATED_AT TRIGGER
-- =====================================================================

DROP TRIGGER IF EXISTS update_itinerary_resources_updated_at ON itinerary_resources;
CREATE TRIGGER update_itinerary_resources_updated_at
  BEFORE UPDATE ON itinerary_resources
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- 4. CREATE AUTO-POPULATE TENANT_ID TRIGGER
-- =====================================================================

CREATE OR REPLACE FUNCTION auto_populate_resource_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  -- If tenant_id is not provided, get it from the itinerary
  IF NEW.tenant_id IS NULL THEN
    SELECT tenant_id INTO NEW.tenant_id
    FROM itineraries
    WHERE id = NEW.itinerary_id;

    IF NEW.tenant_id IS NULL THEN
      RAISE EXCEPTION 'Cannot determine tenant_id for itinerary_id %', NEW.itinerary_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ensure_resource_tenant_id ON itinerary_resources;
CREATE TRIGGER ensure_resource_tenant_id
  BEFORE INSERT ON itinerary_resources
  FOR EACH ROW
  EXECUTE FUNCTION auto_populate_resource_tenant_id();

-- =====================================================================
-- 5. ENABLE ROW LEVEL SECURITY
-- =====================================================================

ALTER TABLE itinerary_resources ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 6. CREATE RLS POLICIES
-- =====================================================================

-- SELECT: Users can view their own tenant's resource assignments
CREATE POLICY "Users can view own tenant resources"
  ON itinerary_resources
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- INSERT: Users can create resource assignments for their own tenant
CREATE POLICY "Users can insert own tenant resources"
  ON itinerary_resources
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- UPDATE: Managers and above can update their tenant's resource assignments
CREATE POLICY "Users can update own tenant resources"
  ON itinerary_resources
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND user_has_role('manager'));

-- DELETE: Managers and above can delete their tenant's resource assignments
CREATE POLICY "Users can delete own tenant resources"
  ON itinerary_resources
  FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND user_has_role('manager'));

-- =====================================================================
-- 7. SUMMARY
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ ITINERARY_RESOURCES TABLE CREATED';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Created:';
  RAISE NOTICE '   • itinerary_resources table';
  RAISE NOTICE '   • 5 indexes for performance';
  RAISE NOTICE '   • Auto-populate tenant_id trigger';
  RAISE NOTICE '   • Updated_at trigger';
  RAISE NOTICE '   • Row Level Security enabled';
  RAISE NOTICE '   • 4 RLS policies (SELECT, INSERT, UPDATE, DELETE)';
  RAISE NOTICE '';
  RAISE NOTICE '🔒 Security:';
  RAISE NOTICE '   • Multi-tenant from the start';
  RAISE NOTICE '   • Cross-tenant access blocked';
  RAISE NOTICE '   • Manager+ required for updates/deletes';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Resource Types Supported:';
  RAISE NOTICE '   • guide, vehicle, hotel, restaurant';
  RAISE NOTICE '   • cruise, airport_staff, hotel_staff';
  RAISE NOTICE '';
END $$;
