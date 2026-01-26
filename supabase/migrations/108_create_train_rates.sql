-- =====================================================================
-- Migration 108: Create train_rates Table
-- Description: Creates the train_rates table for regular train services
-- Date: 2026-01-25
-- =====================================================================

-- =====================================================================
-- 1. CREATE TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS train_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- Service identification
  service_code VARCHAR(50),

  -- Route details
  origin_city VARCHAR(100) NOT NULL,
  destination_city VARCHAR(100) NOT NULL,

  -- Service type
  class_type VARCHAR(50) DEFAULT 'first_class',
  operator_name VARCHAR(100),

  -- Pricing
  rate_eur DECIMAL(10, 2) NOT NULL DEFAULT 0,

  -- Schedule
  duration_hours DECIMAL(5, 2),
  departure_times TEXT,

  -- Rate validity
  rate_valid_from DATE,
  rate_valid_to DATE,

  -- Additional info
  description TEXT,
  notes TEXT,

  -- Supplier reference
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 2. INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_train_rates_tenant_id ON train_rates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_train_rates_origin_city ON train_rates(origin_city);
CREATE INDEX IF NOT EXISTS idx_train_rates_destination_city ON train_rates(destination_city);
CREATE INDEX IF NOT EXISTS idx_train_rates_class_type ON train_rates(class_type);
CREATE INDEX IF NOT EXISTS idx_train_rates_supplier_id ON train_rates(supplier_id);
CREATE INDEX IF NOT EXISTS idx_train_rates_is_active ON train_rates(is_active);
CREATE INDEX IF NOT EXISTS idx_train_rates_service_code ON train_rates(service_code);

-- =====================================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================================

ALTER TABLE train_rates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see train rates for their tenant
CREATE POLICY train_rates_tenant_isolation ON train_rates
  FOR ALL
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());

-- Policy: Service role can access all
CREATE POLICY train_rates_service_role ON train_rates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================================
-- 4. UPDATED_AT TRIGGER
-- =====================================================================

CREATE OR REPLACE FUNCTION update_train_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_train_rates_updated_at ON train_rates;
CREATE TRIGGER trigger_train_rates_updated_at
  BEFORE UPDATE ON train_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_train_rates_updated_at();

-- =====================================================================
-- 5. SEED DATA - Common Egypt Train Routes
-- =====================================================================

INSERT INTO train_rates (origin_city, destination_city, class_type, rate_eur, duration_hours, operator_name, notes)
VALUES
  -- Cairo - Alexandria
  ('Cairo', 'Alexandria', 'first_class', 15.00, 2.5, 'ENR', 'Egyptian National Railways - First Class AC'),
  ('Cairo', 'Alexandria', 'second_class', 8.00, 2.5, 'ENR', 'Egyptian National Railways - Second Class AC'),
  ('Alexandria', 'Cairo', 'first_class', 15.00, 2.5, 'ENR', 'Egyptian National Railways - First Class AC'),
  ('Alexandria', 'Cairo', 'second_class', 8.00, 2.5, 'ENR', 'Egyptian National Railways - Second Class AC'),

  -- Cairo - Luxor (day train)
  ('Cairo', 'Luxor', 'first_class', 35.00, 9.0, 'ENR', 'Day train - First Class AC'),
  ('Cairo', 'Luxor', 'second_class', 20.00, 9.0, 'ENR', 'Day train - Second Class AC'),
  ('Luxor', 'Cairo', 'first_class', 35.00, 9.0, 'ENR', 'Day train - First Class AC'),
  ('Luxor', 'Cairo', 'second_class', 20.00, 9.0, 'ENR', 'Day train - Second Class AC'),

  -- Cairo - Aswan (day train)
  ('Cairo', 'Aswan', 'first_class', 40.00, 12.0, 'ENR', 'Day train - First Class AC'),
  ('Cairo', 'Aswan', 'second_class', 25.00, 12.0, 'ENR', 'Day train - Second Class AC'),
  ('Aswan', 'Cairo', 'first_class', 40.00, 12.0, 'ENR', 'Day train - First Class AC'),
  ('Aswan', 'Cairo', 'second_class', 25.00, 12.0, 'ENR', 'Day train - Second Class AC'),

  -- Luxor - Aswan
  ('Luxor', 'Aswan', 'first_class', 15.00, 3.0, 'ENR', 'Local train - First Class'),
  ('Luxor', 'Aswan', 'second_class', 8.00, 3.0, 'ENR', 'Local train - Second Class'),
  ('Aswan', 'Luxor', 'first_class', 15.00, 3.0, 'ENR', 'Local train - First Class'),
  ('Aswan', 'Luxor', 'second_class', 8.00, 3.0, 'ENR', 'Local train - Second Class')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM train_rates;

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 108 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'train_rates table created with:';
  RAISE NOTICE '  - Route info (origin/destination city)';
  RAISE NOTICE '  - Class type and operator';
  RAISE NOTICE '  - Pricing (rate_eur)';
  RAISE NOTICE '  - Duration and schedule';
  RAISE NOTICE '  - Rate validity period';
  RAISE NOTICE '  - Supplier reference';
  RAISE NOTICE '  - RLS policies for tenant isolation';
  RAISE NOTICE '';
  RAISE NOTICE 'Seeded % train routes', row_count;
  RAISE NOTICE '';
END $$;
