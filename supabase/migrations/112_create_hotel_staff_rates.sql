-- =====================================================================
-- Migration 112: Create hotel_staff_rates Table
-- Description: Creates the hotel_staff_rates table for hotel services
-- Date: 2026-01-25
-- =====================================================================

-- =====================================================================
-- 1. CREATE TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS hotel_staff_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- Service identification
  service_code VARCHAR(50),

  -- Service details
  service_type VARCHAR(50) NOT NULL DEFAULT 'porter',
  hotel_category VARCHAR(20) DEFAULT 'all',

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

CREATE INDEX IF NOT EXISTS idx_hotel_staff_rates_tenant_id ON hotel_staff_rates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hotel_staff_rates_service_type ON hotel_staff_rates(service_type);
CREATE INDEX IF NOT EXISTS idx_hotel_staff_rates_hotel_category ON hotel_staff_rates(hotel_category);
CREATE INDEX IF NOT EXISTS idx_hotel_staff_rates_is_active ON hotel_staff_rates(is_active);
CREATE INDEX IF NOT EXISTS idx_hotel_staff_rates_service_code ON hotel_staff_rates(service_code);

-- =====================================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================================

ALTER TABLE hotel_staff_rates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see hotel staff rates for their tenant
CREATE POLICY hotel_staff_rates_tenant_isolation ON hotel_staff_rates
  FOR ALL
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());

-- Policy: Service role can access all
CREATE POLICY hotel_staff_rates_service_role ON hotel_staff_rates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================================
-- 4. UPDATED_AT TRIGGER
-- =====================================================================

CREATE OR REPLACE FUNCTION update_hotel_staff_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_hotel_staff_rates_updated_at ON hotel_staff_rates;
CREATE TRIGGER trigger_hotel_staff_rates_updated_at
  BEFORE UPDATE ON hotel_staff_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_hotel_staff_rates_updated_at();

-- =====================================================================
-- 5. SEED DATA - Hotel Services
-- =====================================================================

INSERT INTO hotel_staff_rates (service_type, hotel_category, rate_eur, description, notes)
VALUES
  -- Porter services
  ('porter', 'budget', 3.00, 'Porter service - budget hotels', 'Luggage assistance'),
  ('porter', 'standard', 5.00, 'Porter service - standard hotels', 'Luggage assistance'),
  ('porter', 'luxury', 8.00, 'Porter service - luxury hotels', 'Full luggage service'),
  ('porter', 'all', 5.00, 'Porter service - all categories', 'Default rate'),

  -- Check-in assistance
  ('checkin_assist', 'budget', 5.00, 'Check-in assistance - budget', 'Help with check-in process'),
  ('checkin_assist', 'standard', 8.00, 'Check-in assistance - standard', 'Help with check-in process'),
  ('checkin_assist', 'luxury', 10.00, 'Check-in assistance - luxury', 'VIP check-in assistance'),
  ('checkin_assist', 'all', 7.00, 'Check-in assistance - all', 'Default rate'),

  -- Full service
  ('full_service', 'budget', 10.00, 'Full service - budget', 'Porter + check-in assist'),
  ('full_service', 'standard', 15.00, 'Full service - standard', 'Porter + check-in assist'),
  ('full_service', 'luxury', 20.00, 'Full service - luxury', 'Complete guest assistance'),
  ('full_service', 'all', 15.00, 'Full service - all', 'Default rate'),

  -- Concierge services
  ('concierge', 'standard', 15.00, 'Concierge service - standard', 'Arrangement assistance'),
  ('concierge', 'luxury', 25.00, 'Concierge service - luxury', 'Premium arrangements'),
  ('concierge', 'all', 20.00, 'Concierge service - all', 'Default rate')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM hotel_staff_rates;

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 112 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'hotel_staff_rates table created with:';
  RAISE NOTICE '  - Service type (porter, checkin_assist, full_service, concierge)';
  RAISE NOTICE '  - Hotel category (budget, standard, luxury, all)';
  RAISE NOTICE '  - EUR pricing';
  RAISE NOTICE '  - RLS policies for tenant isolation';
  RAISE NOTICE '';
  RAISE NOTICE 'Seeded % hotel service rates', row_count;
  RAISE NOTICE '';
END $$;
