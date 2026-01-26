-- =====================================================================
-- Migration 110: Create airport_staff_rates Table
-- Description: Creates the airport_staff_rates table for airport services
-- Date: 2026-01-25
-- =====================================================================

-- =====================================================================
-- 1. CREATE TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS airport_staff_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- Service identification
  service_code VARCHAR(50),

  -- Airport details
  airport_code VARCHAR(10) NOT NULL,
  service_type VARCHAR(50) NOT NULL DEFAULT 'meet_greet',
  direction VARCHAR(20) DEFAULT 'both',

  -- Pricing
  rate_eur DECIMAL(10, 2) NOT NULL DEFAULT 0,

  -- Additional info
  description TEXT,
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

CREATE INDEX IF NOT EXISTS idx_airport_staff_rates_tenant_id ON airport_staff_rates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_airport_staff_rates_airport_code ON airport_staff_rates(airport_code);
CREATE INDEX IF NOT EXISTS idx_airport_staff_rates_service_type ON airport_staff_rates(service_type);
CREATE INDEX IF NOT EXISTS idx_airport_staff_rates_direction ON airport_staff_rates(direction);
CREATE INDEX IF NOT EXISTS idx_airport_staff_rates_is_active ON airport_staff_rates(is_active);
CREATE INDEX IF NOT EXISTS idx_airport_staff_rates_service_code ON airport_staff_rates(service_code);

-- =====================================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================================

ALTER TABLE airport_staff_rates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see airport staff rates for their tenant
CREATE POLICY airport_staff_rates_tenant_isolation ON airport_staff_rates
  FOR ALL
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());

-- Policy: Service role can access all
CREATE POLICY airport_staff_rates_service_role ON airport_staff_rates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================================
-- 4. UPDATED_AT TRIGGER
-- =====================================================================

CREATE OR REPLACE FUNCTION update_airport_staff_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_airport_staff_rates_updated_at ON airport_staff_rates;
CREATE TRIGGER trigger_airport_staff_rates_updated_at
  BEFORE UPDATE ON airport_staff_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_airport_staff_rates_updated_at();

-- =====================================================================
-- 5. SEED DATA - Common Egypt Airport Services
-- =====================================================================

INSERT INTO airport_staff_rates (airport_code, service_type, direction, rate_eur, description, notes)
VALUES
  -- Cairo International (CAI)
  ('CAI', 'meet_greet', 'arrival', 15.00, 'Meet & Greet at arrivals', 'Staff meets at gate exit'),
  ('CAI', 'meet_greet', 'departure', 10.00, 'Meet & Greet at departures', 'Assist with check-in'),
  ('CAI', 'customs_assist', 'arrival', 25.00, 'Customs assistance', 'Help with customs clearance'),
  ('CAI', 'full_service', 'arrival', 40.00, 'Full arrival service', 'Meet, customs, luggage, transfer escort'),
  ('CAI', 'full_service', 'departure', 35.00, 'Full departure service', 'Check-in, security, lounge escort'),
  ('CAI', 'vip_service', 'both', 75.00, 'VIP fast track service', 'Priority processing all areas'),

  -- Luxor International (LXR)
  ('LXR', 'meet_greet', 'arrival', 12.00, 'Meet & Greet at arrivals', 'Staff meets at gate exit'),
  ('LXR', 'meet_greet', 'departure', 8.00, 'Meet & Greet at departures', 'Assist with check-in'),
  ('LXR', 'full_service', 'arrival', 30.00, 'Full arrival service', 'Meet and assist'),
  ('LXR', 'full_service', 'departure', 25.00, 'Full departure service', 'Check-in assistance'),

  -- Aswan International (ASW)
  ('ASW', 'meet_greet', 'arrival', 12.00, 'Meet & Greet at arrivals', 'Staff meets at gate exit'),
  ('ASW', 'meet_greet', 'departure', 8.00, 'Meet & Greet at departures', 'Assist with check-in'),
  ('ASW', 'full_service', 'arrival', 30.00, 'Full arrival service', 'Meet and assist'),
  ('ASW', 'full_service', 'departure', 25.00, 'Full departure service', 'Check-in assistance'),

  -- Hurghada International (HRG)
  ('HRG', 'meet_greet', 'arrival', 12.00, 'Meet & Greet at arrivals', 'Staff meets at gate exit'),
  ('HRG', 'meet_greet', 'departure', 8.00, 'Meet & Greet at departures', 'Assist with check-in'),
  ('HRG', 'full_service', 'arrival', 30.00, 'Full arrival service', 'Meet and assist'),
  ('HRG', 'full_service', 'departure', 25.00, 'Full departure service', 'Check-in assistance'),
  ('HRG', 'vip_service', 'both', 60.00, 'VIP fast track service', 'Priority processing'),

  -- Sharm El Sheikh (SSH)
  ('SSH', 'meet_greet', 'arrival', 12.00, 'Meet & Greet at arrivals', 'Staff meets at gate exit'),
  ('SSH', 'meet_greet', 'departure', 8.00, 'Meet & Greet at departures', 'Assist with check-in'),
  ('SSH', 'full_service', 'arrival', 30.00, 'Full arrival service', 'Meet and assist'),
  ('SSH', 'full_service', 'departure', 25.00, 'Full departure service', 'Check-in assistance'),
  ('SSH', 'vip_service', 'both', 60.00, 'VIP fast track service', 'Priority processing')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM airport_staff_rates;

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 110 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'airport_staff_rates table created with:';
  RAISE NOTICE '  - Airport code and service type';
  RAISE NOTICE '  - Direction (arrival/departure/both)';
  RAISE NOTICE '  - EUR pricing';
  RAISE NOTICE '  - Description and notes';
  RAISE NOTICE '  - RLS policies for tenant isolation';
  RAISE NOTICE '';
  RAISE NOTICE 'Seeded % airport service rates', row_count;
  RAISE NOTICE '';
END $$;
