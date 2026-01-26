-- =====================================================================
-- Migration 109: Create entrance_fees Table
-- Description: Creates the entrance_fees table for attraction/entrance fee rates
-- Date: 2026-01-25
-- =====================================================================

-- =====================================================================
-- 1. CREATE TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS entrance_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- Service identification
  service_code VARCHAR(50),

  -- Attraction details
  attraction_name VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  category VARCHAR(100),
  fee_type VARCHAR(50) DEFAULT 'standard',

  -- Pricing
  eur_rate DECIMAL(10, 2) NOT NULL DEFAULT 0,
  non_eur_rate DECIMAL(10, 2) DEFAULT 0,
  egyptian_rate DECIMAL(10, 2),

  -- Discounts
  student_discount_percentage DECIMAL(5, 2),
  child_discount_percent DECIMAL(5, 2),

  -- Season and validity
  season VARCHAR(50) DEFAULT 'all_year',
  rate_valid_from DATE,
  rate_valid_to DATE,

  -- Additional info
  notes TEXT,
  is_active BOOLEAN DEFAULT true,

  -- Addon features
  is_addon BOOLEAN DEFAULT false,
  addon_note TEXT,

  -- Supplier reference
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 2. INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_entrance_fees_tenant_id ON entrance_fees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_entrance_fees_city ON entrance_fees(city);
CREATE INDEX IF NOT EXISTS idx_entrance_fees_category ON entrance_fees(category);
CREATE INDEX IF NOT EXISTS idx_entrance_fees_is_active ON entrance_fees(is_active);
CREATE INDEX IF NOT EXISTS idx_entrance_fees_is_addon ON entrance_fees(is_addon);
CREATE INDEX IF NOT EXISTS idx_entrance_fees_attraction_name ON entrance_fees(attraction_name);
CREATE INDEX IF NOT EXISTS idx_entrance_fees_service_code ON entrance_fees(service_code);
CREATE INDEX IF NOT EXISTS idx_entrance_fees_supplier_id ON entrance_fees(supplier_id);

-- =====================================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================================

ALTER TABLE entrance_fees ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see entrance fees for their tenant
CREATE POLICY entrance_fees_tenant_isolation ON entrance_fees
  FOR ALL
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());

-- Policy: Service role can access all
CREATE POLICY entrance_fees_service_role ON entrance_fees
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================================
-- 4. UPDATED_AT TRIGGER
-- =====================================================================

CREATE OR REPLACE FUNCTION update_entrance_fees_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_entrance_fees_updated_at ON entrance_fees;
CREATE TRIGGER trigger_entrance_fees_updated_at
  BEFORE UPDATE ON entrance_fees
  FOR EACH ROW
  EXECUTE FUNCTION update_entrance_fees_updated_at();

-- =====================================================================
-- 5. SEED DATA - Common Egypt Attractions
-- =====================================================================

INSERT INTO entrance_fees (attraction_name, city, category, fee_type, eur_rate, non_eur_rate, notes)
VALUES
  -- Giza
  ('Pyramids of Giza', 'Cairo', 'Pyramids', 'standard', 15.00, 15.00, 'Entry to the Giza Plateau'),
  ('Great Pyramid Interior', 'Cairo', 'Pyramids', 'premium', 25.00, 25.00, 'Entry inside the Great Pyramid'),
  ('Sphinx Area', 'Cairo', 'Pyramids', 'standard', 0.00, 0.00, 'Included with Pyramids ticket'),
  ('Solar Boat Museum', 'Cairo', 'Museums', 'standard', 10.00, 10.00, 'Khufu Ship Museum'),

  -- Cairo
  ('Egyptian Museum', 'Cairo', 'Museums', 'standard', 15.00, 15.00, 'Tahrir Square location'),
  ('Grand Egyptian Museum', 'Cairo', 'Museums', 'standard', 30.00, 30.00, 'New GEM near Pyramids'),
  ('Citadel of Saladin', 'Cairo', 'Historical', 'standard', 10.00, 10.00, 'Includes Mohammed Ali Mosque'),
  ('Khan el-Khalili', 'Cairo', 'Markets', 'free', 0.00, 0.00, 'Free entry to bazaar'),
  ('Coptic Cairo', 'Cairo', 'Religious', 'standard', 5.00, 5.00, 'Old Cairo churches complex'),

  -- Luxor
  ('Karnak Temple', 'Luxor', 'Temples', 'standard', 15.00, 15.00, 'Largest temple complex'),
  ('Luxor Temple', 'Luxor', 'Temples', 'standard', 12.00, 12.00, 'Central Luxor location'),
  ('Valley of the Kings', 'Luxor', 'Tombs', 'standard', 20.00, 20.00, 'Entry to 3 tombs'),
  ('Valley of the Queens', 'Luxor', 'Tombs', 'standard', 10.00, 10.00, 'Entry to 3 tombs'),
  ('Hatshepsut Temple', 'Luxor', 'Temples', 'standard', 12.00, 12.00, 'Deir el-Bahari'),
  ('Tomb of Tutankhamun', 'Luxor', 'Tombs', 'premium', 35.00, 35.00, 'Additional ticket required'),
  ('Luxor Museum', 'Luxor', 'Museums', 'standard', 15.00, 15.00, 'Modern museum'),
  ('Colossi of Memnon', 'Luxor', 'Monuments', 'free', 0.00, 0.00, 'Free to view'),

  -- Aswan
  ('Philae Temple', 'Aswan', 'Temples', 'standard', 15.00, 15.00, 'Island temple of Isis'),
  ('Aswan High Dam', 'Aswan', 'Monuments', 'standard', 5.00, 5.00, 'Dam viewpoint'),
  ('Unfinished Obelisk', 'Aswan', 'Historical', 'standard', 8.00, 8.00, 'Ancient quarry site'),
  ('Nubian Museum', 'Aswan', 'Museums', 'standard', 10.00, 10.00, 'Nubian culture exhibits'),
  ('Elephantine Island', 'Aswan', 'Historical', 'standard', 10.00, 10.00, 'Ancient ruins'),

  -- Abu Simbel
  ('Abu Simbel Temples', 'Abu Simbel', 'Temples', 'standard', 25.00, 25.00, 'Ramesses II temples'),

  -- Alexandria
  ('Qaitbay Citadel', 'Alexandria', 'Historical', 'standard', 8.00, 8.00, 'Medieval fortress'),
  ('Bibliotheca Alexandrina', 'Alexandria', 'Museums', 'standard', 10.00, 10.00, 'Modern library'),
  ('Catacombs of Kom el-Shoqafa', 'Alexandria', 'Tombs', 'standard', 8.00, 8.00, 'Roman-era tombs')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM entrance_fees;

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 109 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'entrance_fees table created with:';
  RAISE NOTICE '  - Attraction details (name, city, category)';
  RAISE NOTICE '  - Pricing (eur_rate, non_eur_rate, egyptian_rate)';
  RAISE NOTICE '  - Discounts (student, child)';
  RAISE NOTICE '  - Season and validity periods';
  RAISE NOTICE '  - Addon features for optional activities';
  RAISE NOTICE '  - RLS policies for tenant isolation';
  RAISE NOTICE '';
  RAISE NOTICE 'Seeded % attraction/entrance fee rates', row_count;
  RAISE NOTICE '';
END $$;
