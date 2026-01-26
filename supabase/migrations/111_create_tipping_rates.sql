-- =====================================================================
-- Migration 111: Create tipping_rates Table
-- Description: Creates the tipping_rates table for recommended tips
-- Date: 2026-01-25
-- =====================================================================

-- =====================================================================
-- 1. CREATE TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS tipping_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- Service identification
  service_code VARCHAR(50),

  -- Tipping details
  role_type VARCHAR(50) NOT NULL,
  context VARCHAR(50),
  rate_unit VARCHAR(50) DEFAULT 'per_day',

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

CREATE INDEX IF NOT EXISTS idx_tipping_rates_tenant_id ON tipping_rates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tipping_rates_role_type ON tipping_rates(role_type);
CREATE INDEX IF NOT EXISTS idx_tipping_rates_context ON tipping_rates(context);
CREATE INDEX IF NOT EXISTS idx_tipping_rates_is_active ON tipping_rates(is_active);
CREATE INDEX IF NOT EXISTS idx_tipping_rates_service_code ON tipping_rates(service_code);

-- =====================================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================================

ALTER TABLE tipping_rates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see tipping rates for their tenant
CREATE POLICY tipping_rates_tenant_isolation ON tipping_rates
  FOR ALL
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());

-- Policy: Service role can access all
CREATE POLICY tipping_rates_service_role ON tipping_rates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================================
-- 4. UPDATED_AT TRIGGER
-- =====================================================================

CREATE OR REPLACE FUNCTION update_tipping_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_tipping_rates_updated_at ON tipping_rates;
CREATE TRIGGER trigger_tipping_rates_updated_at
  BEFORE UPDATE ON tipping_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_tipping_rates_updated_at();

-- =====================================================================
-- 5. SEED DATA - Egypt Tipping Guidelines
-- =====================================================================

INSERT INTO tipping_rates (role_type, context, rate_unit, rate_eur, description, notes)
VALUES
  -- Guide tips
  ('guide', 'day_tour', 'per_day', 10.00, 'Tour guide - full day', 'Recommended tip per traveler'),
  ('guide', 'half_day_tour', 'per_service', 5.00, 'Tour guide - half day', 'Recommended tip per traveler'),
  ('guide', 'cruise', 'per_cruise', 30.00, 'Cruise guide', '4-night cruise recommended total'),

  -- Driver tips
  ('driver', 'day_tour', 'per_day', 5.00, 'Driver - full day', 'Recommended tip per traveler'),
  ('driver', 'half_day_tour', 'per_service', 3.00, 'Driver - half day', 'Recommended tip per traveler'),
  ('driver', 'transfer', 'per_service', 3.00, 'Driver - transfer', 'Airport or hotel transfer'),

  -- Boat crew tips
  ('boat_crew', 'cruise', 'per_cruise', 25.00, 'Nile cruise crew', 'Pooled tip for all crew'),
  ('boat_crew', 'felucca', 'per_service', 3.00, 'Felucca captain', 'Sunset or short trip'),
  ('boat_crew', 'motorboat', 'per_service', 5.00, 'Motorboat to Philae', 'Round trip to temple'),

  -- Porter tips
  ('porter', 'airport', 'per_service', 2.00, 'Airport porter', 'Per bag assistance'),
  ('porter', 'hotel', 'per_service', 1.00, 'Hotel porter', 'Per bag to room'),

  -- Hotel staff tips
  ('hotel_staff', 'hotel', 'per_night', 2.00, 'Housekeeping', 'Left in room daily'),
  ('hotel_staff', 'hotel', 'per_service', 1.00, 'Room service', 'Per delivery'),

  -- Restaurant tips
  ('restaurant', 'restaurant', 'per_person', 2.00, 'Restaurant waiter', 'If service not included'),

  -- Other tips
  ('other', 'airport', 'per_service', 5.00, 'Customs facilitator', 'If using assistance service'),
  ('other', 'day_tour', 'per_service', 2.00, 'Site guardians', 'Temple/tomb guards who assist')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM tipping_rates;

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 111 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'tipping_rates table created with:';
  RAISE NOTICE '  - Role type (guide, driver, porter, etc.)';
  RAISE NOTICE '  - Context (day_tour, cruise, transfer, etc.)';
  RAISE NOTICE '  - Rate unit (per_day, per_service, per_cruise)';
  RAISE NOTICE '  - EUR pricing';
  RAISE NOTICE '  - RLS policies for tenant isolation';
  RAISE NOTICE '';
  RAISE NOTICE 'Seeded % tipping rate guidelines', row_count;
  RAISE NOTICE '';
END $$;
