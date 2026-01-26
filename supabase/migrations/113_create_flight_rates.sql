-- =====================================================================
-- Migration 113: Create flight_rates Table
-- Description: Creates the flight_rates table for flight pricing
-- Date: 2026-01-25
-- =====================================================================

-- =====================================================================
-- 1. CREATE TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS flight_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- Service identification
  service_code VARCHAR(50),

  -- Route details
  route_from VARCHAR(100) NOT NULL,
  route_to VARCHAR(100) NOT NULL,
  route_name VARCHAR(255),

  -- Airline details
  airline VARCHAR(100) NOT NULL,
  airline_code VARCHAR(10),
  flight_number VARCHAR(20),

  -- Flight type
  flight_type VARCHAR(20) DEFAULT 'domestic',
  cabin_class VARCHAR(20) DEFAULT 'economy',

  -- Schedule
  departure_time TIME,
  arrival_time TIME,
  duration_minutes INTEGER,
  frequency VARCHAR(50),

  -- Pricing - EUR
  base_rate_eur DECIMAL(10, 2) NOT NULL DEFAULT 0,
  tax_eur DECIMAL(10, 2) DEFAULT 0,

  -- Pricing - Non-EUR
  base_rate_non_eur DECIMAL(10, 2) DEFAULT 0,
  tax_non_eur DECIMAL(10, 2) DEFAULT 0,

  -- Baggage
  baggage_kg INTEGER DEFAULT 23,
  carry_on_kg INTEGER DEFAULT 7,

  -- Season and validity
  season VARCHAR(50),
  rate_valid_from DATE,
  rate_valid_to DATE,

  -- Supplier reference
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name VARCHAR(255),

  -- Additional info
  notes TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 2. INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_flight_rates_tenant_id ON flight_rates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_flight_rates_route_from ON flight_rates(route_from);
CREATE INDEX IF NOT EXISTS idx_flight_rates_route_to ON flight_rates(route_to);
CREATE INDEX IF NOT EXISTS idx_flight_rates_airline ON flight_rates(airline);
CREATE INDEX IF NOT EXISTS idx_flight_rates_flight_type ON flight_rates(flight_type);
CREATE INDEX IF NOT EXISTS idx_flight_rates_cabin_class ON flight_rates(cabin_class);
CREATE INDEX IF NOT EXISTS idx_flight_rates_is_active ON flight_rates(is_active);
CREATE INDEX IF NOT EXISTS idx_flight_rates_service_code ON flight_rates(service_code);
CREATE INDEX IF NOT EXISTS idx_flight_rates_supplier_id ON flight_rates(supplier_id);

-- =====================================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================================

ALTER TABLE flight_rates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see flight rates for their tenant
CREATE POLICY flight_rates_tenant_isolation ON flight_rates
  FOR ALL
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());

-- Policy: Service role can access all
CREATE POLICY flight_rates_service_role ON flight_rates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================================
-- 4. UPDATED_AT TRIGGER
-- =====================================================================

CREATE OR REPLACE FUNCTION update_flight_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_flight_rates_updated_at ON flight_rates;
CREATE TRIGGER trigger_flight_rates_updated_at
  BEFORE UPDATE ON flight_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_flight_rates_updated_at();

-- =====================================================================
-- 5. SEED DATA - Common Egypt Domestic Flights
-- =====================================================================

INSERT INTO flight_rates (route_from, route_to, route_name, airline, airline_code, flight_type, cabin_class, base_rate_eur, base_rate_non_eur, tax_eur, duration_minutes, frequency, notes)
VALUES
  -- Cairo to Luxor
  ('Cairo', 'Luxor', 'Cairo to Luxor', 'EgyptAir', 'MS', 'domestic', 'economy', 120.00, 120.00, 25.00, 55, 'daily', 'Multiple daily flights'),
  ('Cairo', 'Luxor', 'Cairo to Luxor', 'EgyptAir', 'MS', 'domestic', 'business', 250.00, 250.00, 25.00, 55, 'daily', 'Business class available'),
  ('Cairo', 'Luxor', 'Cairo to Luxor', 'Nile Air', 'NP', 'domestic', 'economy', 95.00, 95.00, 20.00, 55, 'daily', 'Budget option'),

  -- Luxor to Cairo
  ('Luxor', 'Cairo', 'Luxor to Cairo', 'EgyptAir', 'MS', 'domestic', 'economy', 120.00, 120.00, 25.00, 55, 'daily', 'Multiple daily flights'),
  ('Luxor', 'Cairo', 'Luxor to Cairo', 'Nile Air', 'NP', 'domestic', 'economy', 95.00, 95.00, 20.00, 55, 'daily', 'Budget option'),

  -- Cairo to Aswan
  ('Cairo', 'Aswan', 'Cairo to Aswan', 'EgyptAir', 'MS', 'domestic', 'economy', 140.00, 140.00, 25.00, 80, 'daily', 'Direct flights'),
  ('Cairo', 'Aswan', 'Cairo to Aswan', 'EgyptAir', 'MS', 'domestic', 'business', 280.00, 280.00, 25.00, 80, 'daily', 'Business class'),

  -- Aswan to Cairo
  ('Aswan', 'Cairo', 'Aswan to Cairo', 'EgyptAir', 'MS', 'domestic', 'economy', 140.00, 140.00, 25.00, 80, 'daily', 'Direct flights'),

  -- Cairo to Abu Simbel
  ('Cairo', 'Abu Simbel', 'Cairo to Abu Simbel', 'EgyptAir', 'MS', 'domestic', 'economy', 200.00, 200.00, 30.00, 90, 'mon_wed_fri', 'Limited schedule'),
  ('Aswan', 'Abu Simbel', 'Aswan to Abu Simbel', 'EgyptAir', 'MS', 'domestic', 'economy', 150.00, 150.00, 25.00, 30, 'daily', 'Short hop'),

  -- Cairo to Hurghada
  ('Cairo', 'Hurghada', 'Cairo to Hurghada', 'EgyptAir', 'MS', 'domestic', 'economy', 100.00, 100.00, 25.00, 55, 'daily', 'Red Sea resort'),
  ('Cairo', 'Hurghada', 'Cairo to Hurghada', 'Air Cairo', 'SM', 'domestic', 'economy', 85.00, 85.00, 20.00, 55, 'daily', 'Budget carrier'),

  -- Cairo to Sharm El Sheikh
  ('Cairo', 'Sharm El Sheikh', 'Cairo to Sharm El Sheikh', 'EgyptAir', 'MS', 'domestic', 'economy', 100.00, 100.00, 25.00, 50, 'daily', 'Sinai resort'),
  ('Cairo', 'Sharm El Sheikh', 'Cairo to Sharm El Sheikh', 'Air Cairo', 'SM', 'domestic', 'economy', 85.00, 85.00, 20.00, 50, 'daily', 'Budget carrier'),

  -- Luxor to Aswan
  ('Luxor', 'Aswan', 'Luxor to Aswan', 'EgyptAir', 'MS', 'domestic', 'economy', 80.00, 80.00, 20.00, 30, 'daily', 'Short connection'),
  ('Aswan', 'Luxor', 'Aswan to Luxor', 'EgyptAir', 'MS', 'domestic', 'economy', 80.00, 80.00, 20.00, 30, 'daily', 'Short connection')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM flight_rates;

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 113 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'flight_rates table created with:';
  RAISE NOTICE '  - Route details (from, to, route_name)';
  RAISE NOTICE '  - Airline info (name, code, flight number)';
  RAISE NOTICE '  - Flight type and cabin class';
  RAISE NOTICE '  - Schedule (times, duration, frequency)';
  RAISE NOTICE '  - Pricing (EUR and non-EUR with taxes)';
  RAISE NOTICE '  - Baggage allowances';
  RAISE NOTICE '  - RLS policies for tenant isolation';
  RAISE NOTICE '';
  RAISE NOTICE 'Seeded % flight rates', row_count;
  RAISE NOTICE '';
END $$;
