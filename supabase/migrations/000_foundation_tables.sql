-- =====================================================================
-- Autoura Foundation: Core Database Tables
-- Description: Creates all foundational tables needed for the system
-- Version: 1.0
-- Date: 2026-01-22
-- =====================================================================

-- =====================================================================
-- 1. AUTHENTICATION & USER MANAGEMENT
-- =====================================================================

-- User profiles (linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(20) DEFAULT 'agent'
    CHECK (role IN ('admin', 'manager', 'agent', 'viewer')),
  company_name VARCHAR(255),
  phone VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_active ON user_profiles(is_active);

-- =====================================================================
-- 2. CLIENT MANAGEMENT (CRM)
-- =====================================================================

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code VARCHAR(50) UNIQUE,

  -- Contact information
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  whatsapp VARCHAR(50),

  -- Client details
  nationality VARCHAR(100),
  language VARCHAR(50) DEFAULT 'English',

  -- Address
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100),

  -- Business info
  status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'blocked')),
  source VARCHAR(50) DEFAULT 'direct'
    CHECK (source IN ('direct', 'referral', 'website', 'social_media', 'whatsapp', 'email', 'other')),

  -- Notes
  notes TEXT,
  preferences JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_created ON clients(created_at DESC);

-- =====================================================================
-- 3. B2B PARTNERS
-- =====================================================================

CREATE TABLE IF NOT EXISTS b2b_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_code VARCHAR(50) UNIQUE NOT NULL,

  -- Company info
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),

  -- Business details
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100),
  partner_type VARCHAR(50) DEFAULT 'tour_operator'
    CHECK (partner_type IN ('tour_operator', 'travel_agent', 'dmc', 'ota', 'other')),

  -- Financial
  commission_percent DECIMAL(5,2) DEFAULT 0,
  payment_terms VARCHAR(100),
  default_margin_percent DECIMAL(5,2),

  -- Status
  is_active BOOLEAN DEFAULT true,
  status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'pending')),

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_b2b_partners_code ON b2b_partners(partner_code);
CREATE INDEX IF NOT EXISTS idx_b2b_partners_active ON b2b_partners(is_active);
CREATE INDEX IF NOT EXISTS idx_b2b_partners_status ON b2b_partners(status);

-- =====================================================================
-- 4. ITINERARIES
-- =====================================================================

CREATE TABLE IF NOT EXISTS itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_code VARCHAR(50) UNIQUE NOT NULL,

  -- Client reference
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name VARCHAR(255),
  client_email VARCHAR(255),
  client_phone VARCHAR(50),

  -- Trip details
  trip_name VARCHAR(255),
  travel_date DATE,
  start_date DATE,
  end_date DATE,
  total_days INTEGER,
  num_adults INTEGER DEFAULT 2,
  num_children INTEGER DEFAULT 0,

  -- Package details
  package_type VARCHAR(50) DEFAULT 'land-package'
    CHECK (package_type IN ('day-trips', 'tours-only', 'land-package', 'cruise-package', 'cruise-land')),
  tier VARCHAR(20) DEFAULT 'standard'
    CHECK (tier IN ('budget', 'standard', 'deluxe', 'luxury')),

  -- Pricing (kept for backward compatibility)
  total_cost DECIMAL(12,2),
  supplier_cost DECIMAL(12,2),
  profit DECIMAL(12,2),
  margin_percent DECIMAL(5,2),
  selling_price DECIMAL(12,2),
  currency VARCHAR(3) DEFAULT 'EUR',

  -- Status
  status VARCHAR(20) DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'quoted', 'accepted', 'confirmed', 'rejected', 'completed', 'cancelled')),

  -- Notes
  notes TEXT,
  internal_notes TEXT,

  -- PDF
  pdf_url TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_itineraries_code ON itineraries(itinerary_code);
CREATE INDEX IF NOT EXISTS idx_itineraries_client ON itineraries(client_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_status ON itineraries(status);
CREATE INDEX IF NOT EXISTS idx_itineraries_start_date ON itineraries(start_date);
CREATE INDEX IF NOT EXISTS idx_itineraries_created ON itineraries(created_at DESC);

-- =====================================================================
-- 5. ITINERARY DAYS
-- =====================================================================

CREATE TABLE IF NOT EXISTS itinerary_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,

  day_number INTEGER NOT NULL,
  date DATE,
  title VARCHAR(255),
  description TEXT,

  -- Location
  city VARCHAR(100),
  overnight_city VARCHAR(100),

  -- Day type
  is_arrival BOOLEAN DEFAULT false,
  is_departure BOOLEAN DEFAULT false,
  is_free_day BOOLEAN DEFAULT false,

  -- Services
  guide_required BOOLEAN DEFAULT false,
  transport_type VARCHAR(50),
  accommodation_type VARCHAR(50)
    CHECK (accommodation_type IN ('hotel', 'cruise', 'none')),

  -- Hotel details
  hotel_id UUID,
  hotel_name VARCHAR(255),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(itinerary_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_itinerary_days_itinerary ON itinerary_days(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_days_day_number ON itinerary_days(day_number);
CREATE INDEX IF NOT EXISTS idx_itinerary_days_date ON itinerary_days(date);

-- =====================================================================
-- 6. ITINERARY SERVICES
-- =====================================================================

CREATE TABLE IF NOT EXISTS itinerary_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  day_id UUID REFERENCES itinerary_days(id) ON DELETE CASCADE,

  -- Service details
  service_type VARCHAR(50) NOT NULL
    CHECK (service_type IN ('accommodation', 'transportation', 'guide', 'entrance_fee', 'meal', 'tip', 'flight', 'transfer', 'other')),
  service_name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Supplier
  supplier_id UUID,
  supplier_name VARCHAR(255),

  -- Pricing
  quantity INTEGER DEFAULT 1,
  unit_cost DECIMAL(10,2),
  total_cost DECIMAL(10,2),

  -- Metadata
  service_date DATE,
  is_included BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_itinerary_services_itinerary ON itinerary_services(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_services_day ON itinerary_services(day_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_services_type ON itinerary_services(service_type);

-- =====================================================================
-- 7. TOUR TEMPLATES
-- =====================================================================

CREATE TABLE IF NOT EXISTS tour_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code VARCHAR(50) UNIQUE NOT NULL,

  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Template details
  duration_days INTEGER NOT NULL,
  theme VARCHAR(100),
  tour_type VARCHAR(50),

  -- Content
  highlights TEXT[],
  inclusions TEXT[],
  exclusions TEXT[],

  -- Itinerary (JSONB for day-by-day structure)
  itinerary JSONB,

  -- Status
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tour_templates_code ON tour_templates(template_code);
CREATE INDEX IF NOT EXISTS idx_tour_templates_active ON tour_templates(is_active);

-- =====================================================================
-- 8. SUPPLIERS
-- =====================================================================

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_code VARCHAR(50) UNIQUE,

  -- Company info
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),

  -- Supplier type
  supplier_type VARCHAR(50)
    CHECK (supplier_type IN ('hotel', 'transport', 'guide', 'restaurant', 'cruise', 'airline', 'activity', 'other')),

  -- Address
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100),

  -- Business details
  payment_terms VARCHAR(100),
  tax_id VARCHAR(100),

  -- Status
  is_active BOOLEAN DEFAULT true,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_type ON suppliers(supplier_type);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(is_active);

-- =====================================================================
-- 9. GUIDES
-- =====================================================================

CREATE TABLE IF NOT EXISTS guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_code VARCHAR(50) UNIQUE,

  -- Personal info
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  whatsapp VARCHAR(50),

  -- Professional details
  languages TEXT[],
  license_number VARCHAR(100),
  specializations TEXT[],

  -- Rates
  daily_rate DECIMAL(10,2),
  half_day_rate DECIMAL(10,2),

  -- Status
  is_active BOOLEAN DEFAULT true,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guides_active ON guides(is_active);

-- =====================================================================
-- 10. VEHICLES
-- =====================================================================

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_code VARCHAR(50) UNIQUE,

  -- Vehicle details
  vehicle_type VARCHAR(50) NOT NULL,
  make VARCHAR(100),
  model VARCHAR(100),
  year INTEGER,
  license_plate VARCHAR(50),

  -- Capacity
  passenger_capacity INTEGER,
  luggage_capacity INTEGER,

  -- Rates
  daily_rate DECIMAL(10,2),

  -- Supplier
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,

  -- Status
  is_active BOOLEAN DEFAULT true,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_type ON vehicles(vehicle_type);
CREATE INDEX IF NOT EXISTS idx_vehicles_active ON vehicles(is_active);

-- =====================================================================
-- 11. UPDATED_AT TRIGGERS
-- =====================================================================

-- Create trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_b2b_partners_updated_at BEFORE UPDATE ON b2b_partners FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_itineraries_updated_at BEFORE UPDATE ON itineraries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_itinerary_days_updated_at BEFORE UPDATE ON itinerary_days FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_itinerary_services_updated_at BEFORE UPDATE ON itinerary_services FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tour_templates_updated_at BEFORE UPDATE ON tour_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_guides_updated_at BEFORE UPDATE ON guides FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- FOUNDATION COMPLETE
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE 'Foundation Migration Complete!';
  RAISE NOTICE '✅ Created: user_profiles';
  RAISE NOTICE '✅ Created: clients';
  RAISE NOTICE '✅ Created: b2b_partners';
  RAISE NOTICE '✅ Created: itineraries';
  RAISE NOTICE '✅ Created: itinerary_days';
  RAISE NOTICE '✅ Created: itinerary_services';
  RAISE NOTICE '✅ Created: tour_templates';
  RAISE NOTICE '✅ Created: suppliers';
  RAISE NOTICE '✅ Created: guides';
  RAISE NOTICE '✅ Created: vehicles';
  RAISE NOTICE '';
  RAISE NOTICE 'Next: Run 001_phase1_core_tables.sql';
END $$;
