-- =====================================================================
-- Migration 017: Create Staff Tables with Multi-Tenancy & RLS
-- Description: Creates airport_staff, hotel_staff, and hotel_contacts tables
--              with tenant isolation and RLS built in from the start
-- Version: 1.0
-- Date: 2026-01-23
-- =====================================================================

-- =====================================================================
-- PART 1: CREATE HOTEL_CONTACTS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS hotel_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Basic Information
  name VARCHAR(255) NOT NULL,
  city VARCHAR(100),
  address TEXT,

  -- Contact Details
  contact_phone VARCHAR(50),
  contact_email VARCHAR(255),
  contact_person VARCHAR(255),

  -- Classification
  star_rating VARCHAR(20),
  tier VARCHAR(20) DEFAULT 'standard'
    CHECK (tier IN ('budget', 'standard', 'deluxe', 'luxury')),

  -- Hotel Type
  property_type VARCHAR(50) DEFAULT 'hotel'
    CHECK (property_type IN ('hotel', 'resort', 'hostel', 'apartment', 'guesthouse', 'villa')),

  -- Preferences
  is_preferred BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  -- Additional Info
  amenities TEXT[],
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for hotel_contacts
CREATE INDEX idx_hotel_contacts_tenant ON hotel_contacts(tenant_id);
CREATE INDEX idx_hotel_contacts_name ON hotel_contacts(name);
CREATE INDEX idx_hotel_contacts_city ON hotel_contacts(city);
CREATE INDEX idx_hotel_contacts_is_active ON hotel_contacts(is_active);
CREATE INDEX idx_hotel_contacts_tier ON hotel_contacts(tier);

-- Enable RLS on hotel_contacts
ALTER TABLE hotel_contacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for hotel_contacts
DROP POLICY IF EXISTS "Users can view tenant hotel contacts" ON hotel_contacts;
CREATE POLICY "Users can view tenant hotel contacts" ON hotel_contacts
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS "Users can insert tenant hotel contacts" ON hotel_contacts;
CREATE POLICY "Users can insert tenant hotel contacts" ON hotel_contacts
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS "Users can update tenant hotel contacts" ON hotel_contacts;
CREATE POLICY "Users can update tenant hotel contacts" ON hotel_contacts
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS "Users can delete tenant hotel contacts" ON hotel_contacts;
CREATE POLICY "Users can delete tenant hotel contacts" ON hotel_contacts
  FOR DELETE
  USING (tenant_id = get_user_tenant_id());

-- Auto-populate trigger for hotel_contacts
DROP TRIGGER IF EXISTS auto_populate_hotel_contacts_tenant_id ON hotel_contacts;
CREATE TRIGGER auto_populate_hotel_contacts_tenant_id
  BEFORE INSERT ON hotel_contacts
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION auto_set_tenant_id();

-- Updated_at trigger for hotel_contacts
DROP TRIGGER IF EXISTS update_hotel_contacts_updated_at ON hotel_contacts;
CREATE TRIGGER update_hotel_contacts_updated_at
  BEFORE UPDATE ON hotel_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- PART 2: CREATE AIRPORT_STAFF TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS airport_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Basic Information
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100),
  airport_location VARCHAR(255) NOT NULL,

  -- Contact Details
  phone VARCHAR(50) NOT NULL,
  whatsapp VARCHAR(50),
  email VARCHAR(255),

  -- Additional Details
  languages TEXT[] DEFAULT '{}',
  shift_times TEXT,
  emergency_contact TEXT,
  notes TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for airport_staff
CREATE INDEX idx_airport_staff_tenant ON airport_staff(tenant_id);
CREATE INDEX idx_airport_staff_airport_location ON airport_staff(airport_location);
CREATE INDEX idx_airport_staff_name ON airport_staff(name);
CREATE INDEX idx_airport_staff_is_active ON airport_staff(is_active);

-- Enable RLS on airport_staff
ALTER TABLE airport_staff ENABLE ROW LEVEL SECURITY;

-- RLS Policies for airport_staff
DROP POLICY IF EXISTS "Users can view tenant airport staff" ON airport_staff;
CREATE POLICY "Users can view tenant airport staff" ON airport_staff
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS "Users can insert tenant airport staff" ON airport_staff;
CREATE POLICY "Users can insert tenant airport staff" ON airport_staff
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS "Users can update tenant airport staff" ON airport_staff;
CREATE POLICY "Users can update tenant airport staff" ON airport_staff
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS "Users can delete tenant airport staff" ON airport_staff;
CREATE POLICY "Users can delete tenant airport staff" ON airport_staff
  FOR DELETE
  USING (tenant_id = get_user_tenant_id());

-- Auto-populate trigger for airport_staff
DROP TRIGGER IF EXISTS auto_populate_airport_staff_tenant_id ON airport_staff;
CREATE TRIGGER auto_populate_airport_staff_tenant_id
  BEFORE INSERT ON airport_staff
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION auto_set_tenant_id();

-- Updated_at trigger for airport_staff
DROP TRIGGER IF EXISTS update_airport_staff_updated_at ON airport_staff;
CREATE TRIGGER update_airport_staff_updated_at
  BEFORE UPDATE ON airport_staff
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- PART 3: CREATE HOTEL_STAFF TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS hotel_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Basic Information
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100),
  hotel_id UUID REFERENCES hotel_contacts(id) ON DELETE SET NULL,

  -- Contact Details
  phone VARCHAR(50) NOT NULL,
  whatsapp VARCHAR(50),
  email VARCHAR(255),

  -- Additional Details
  languages TEXT[] DEFAULT '{}',
  shift_times TEXT,
  notes TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for hotel_staff
CREATE INDEX idx_hotel_staff_tenant ON hotel_staff(tenant_id);
CREATE INDEX idx_hotel_staff_hotel_id ON hotel_staff(hotel_id);
CREATE INDEX idx_hotel_staff_name ON hotel_staff(name);
CREATE INDEX idx_hotel_staff_is_active ON hotel_staff(is_active);

-- Enable RLS on hotel_staff
ALTER TABLE hotel_staff ENABLE ROW LEVEL SECURITY;

-- RLS Policies for hotel_staff
DROP POLICY IF EXISTS "Users can view tenant hotel staff" ON hotel_staff;
CREATE POLICY "Users can view tenant hotel staff" ON hotel_staff
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS "Users can insert tenant hotel staff" ON hotel_staff;
CREATE POLICY "Users can insert tenant hotel staff" ON hotel_staff
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS "Users can update tenant hotel staff" ON hotel_staff;
CREATE POLICY "Users can update tenant hotel staff" ON hotel_staff
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS "Users can delete tenant hotel staff" ON hotel_staff;
CREATE POLICY "Users can delete tenant hotel staff" ON hotel_staff
  FOR DELETE
  USING (tenant_id = get_user_tenant_id());

-- Auto-populate trigger for hotel_staff
DROP TRIGGER IF EXISTS auto_populate_hotel_staff_tenant_id ON hotel_staff;
CREATE TRIGGER auto_populate_hotel_staff_tenant_id
  BEFORE INSERT ON hotel_staff
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION auto_set_tenant_id();

-- Updated_at trigger for hotel_staff
DROP TRIGGER IF EXISTS update_hotel_staff_updated_at ON hotel_staff;
CREATE TRIGGER update_hotel_staff_updated_at
  BEFORE UPDATE ON hotel_staff
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'Migration 017 Complete!';
  RAISE NOTICE '✅ Table: hotel_contacts created with RLS';
  RAISE NOTICE '✅ Table: airport_staff created with RLS';
  RAISE NOTICE '✅ Table: hotel_staff created with RLS';
  RAISE NOTICE '';
  RAISE NOTICE 'Security Status:';
  RAISE NOTICE '✅ All tables have tenant_id NOT NULL';
  RAISE NOTICE '✅ RLS enabled on all 3 tables';
  RAISE NOTICE '✅ 12 RLS policies created (4 per table)';
  RAISE NOTICE '✅ Auto-populate triggers created';
  RAISE NOTICE '✅ Updated_at triggers created';
  RAISE NOTICE '✅ 13 indexes created for performance';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables Created:';
  RAISE NOTICE '1. hotel_contacts - Hotel/accommodation directory';
  RAISE NOTICE '2. airport_staff - Airport representatives';
  RAISE NOTICE '3. hotel_staff - Hotel staff contacts';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Update airport-staff API routes to use createAuthenticatedClient()';
  RAISE NOTICE '2. Update hotel-staff API routes to use createAuthenticatedClient()';
  RAISE NOTICE '3. Delete migrations 014-016 (replaced by this migration)';
  RAISE NOTICE '4. Test all staff endpoints with RLS';
END $$;
