-- ============================================
-- MIGRATION 107: CREATE SLEEPING_TRAIN_RATES TABLE
-- ============================================
-- Creates the sleeping_train_rates table for overnight train services
-- (e.g., Cairo to Luxor/Aswan sleeper trains)
-- Created: 2026-01-25
-- ============================================

-- =====================================================================
-- 1. CREATE SLEEPING_TRAIN_RATES TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS sleeping_train_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- Service identification
  service_code VARCHAR(50) UNIQUE,

  -- Route information
  origin_city VARCHAR(100) NOT NULL,
  destination_city VARCHAR(100) NOT NULL,

  -- Cabin/class type (e.g., 'single_cabin', 'double_cabin', 'suite')
  cabin_type VARCHAR(50) NOT NULL DEFAULT 'double_cabin',

  -- Rates
  rate_oneway_eur DECIMAL(10, 2) NOT NULL DEFAULT 0,
  rate_roundtrip_eur DECIMAL(10, 2),
  rate_oneway_non_eur DECIMAL(10, 2) DEFAULT 0,
  rate_roundtrip_non_eur DECIMAL(10, 2),

  -- Schedule
  departure_time TIME,
  arrival_time TIME,
  departure_days VARCHAR(100), -- e.g., 'daily', 'Mon,Wed,Fri'

  -- Validity
  rate_valid_from DATE,
  rate_valid_to DATE,
  season VARCHAR(50), -- e.g., 'all_year', 'high_season', 'low_season'

  -- Operator/Supplier
  operator_name VARCHAR(255), -- e.g., 'Watania Sleeping Trains', 'ENR'
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,

  -- Additional info
  description TEXT,
  notes TEXT,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 2. CREATE INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_sleeping_train_rates_tenant ON sleeping_train_rates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sleeping_train_rates_origin ON sleeping_train_rates(origin_city);
CREATE INDEX IF NOT EXISTS idx_sleeping_train_rates_destination ON sleeping_train_rates(destination_city);
CREATE INDEX IF NOT EXISTS idx_sleeping_train_rates_cabin_type ON sleeping_train_rates(cabin_type);
CREATE INDEX IF NOT EXISTS idx_sleeping_train_rates_supplier ON sleeping_train_rates(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sleeping_train_rates_active ON sleeping_train_rates(is_active);
CREATE INDEX IF NOT EXISTS idx_sleeping_train_rates_validity ON sleeping_train_rates(rate_valid_from, rate_valid_to);

-- =====================================================================
-- 3. CREATE UPDATED_AT TRIGGER
-- =====================================================================

CREATE OR REPLACE FUNCTION update_sleeping_train_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sleeping_train_rates_updated_at ON sleeping_train_rates;
CREATE TRIGGER trigger_sleeping_train_rates_updated_at
  BEFORE UPDATE ON sleeping_train_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_sleeping_train_rates_updated_at();

-- =====================================================================
-- 4. ENABLE ROW LEVEL SECURITY
-- =====================================================================

ALTER TABLE sleeping_train_rates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see sleeping train rates for their tenant
CREATE POLICY sleeping_train_rates_tenant_isolation ON sleeping_train_rates
  FOR ALL
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());

-- Policy: Service role can access all
CREATE POLICY sleeping_train_rates_service_role ON sleeping_train_rates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================================
-- 5. SEED COMMON SLEEPING TRAIN ROUTES (Optional)
-- =====================================================================

-- Common Egypt sleeping train routes
INSERT INTO sleeping_train_rates (service_code, origin_city, destination_city, cabin_type, rate_oneway_eur, operator_name, is_active)
VALUES
  ('SLP-CAI-LXR-DBL', 'Cairo', 'Luxor', 'double_cabin', 120, 'Watania Sleeping Trains', true),
  ('SLP-CAI-ASW-DBL', 'Cairo', 'Aswan', 'double_cabin', 140, 'Watania Sleeping Trains', true),
  ('SLP-LXR-CAI-DBL', 'Luxor', 'Cairo', 'double_cabin', 120, 'Watania Sleeping Trains', true),
  ('SLP-ASW-CAI-DBL', 'Aswan', 'Cairo', 'double_cabin', 140, 'Watania Sleeping Trains', true),
  ('SLP-CAI-LXR-SGL', 'Cairo', 'Luxor', 'single_cabin', 180, 'Watania Sleeping Trains', true),
  ('SLP-CAI-ASW-SGL', 'Cairo', 'Aswan', 'single_cabin', 200, 'Watania Sleeping Trains', true)
ON CONFLICT (service_code) DO NOTHING;

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM sleeping_train_rates;

  RAISE NOTICE '';
  RAISE NOTICE '✅ Migration 107 completed successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Created sleeping_train_rates table with columns:';
  RAISE NOTICE '  - id, tenant_id, service_code';
  RAISE NOTICE '  - origin_city, destination_city, cabin_type';
  RAISE NOTICE '  - rate_oneway_eur, rate_roundtrip_eur, rate_oneway_non_eur, rate_roundtrip_non_eur';
  RAISE NOTICE '  - departure_time, arrival_time, departure_days';
  RAISE NOTICE '  - rate_valid_from, rate_valid_to, season';
  RAISE NOTICE '  - operator_name, supplier_id';
  RAISE NOTICE '  - description, notes, is_active';
  RAISE NOTICE '  - created_at, updated_at';
  RAISE NOTICE '';
  RAISE NOTICE 'Created indexes for: tenant, origin, destination, cabin_type, supplier, active, validity';
  RAISE NOTICE 'Enabled RLS with tenant-based policies';
  RAISE NOTICE 'Seeded % common routes', row_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Sleeping Train Rates API should now work correctly!';
END $$;
