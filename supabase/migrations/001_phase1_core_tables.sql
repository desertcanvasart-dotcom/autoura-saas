-- =====================================================================
-- Autoura Phase 1A: Core Quote System Migration
-- Description: Creates tenants, B2C quotes, and B2B quotes tables
-- Version: 1.0
-- Date: 2026-01-22
-- =====================================================================

-- =====================================================================
-- 1. TENANTS TABLE (Simplified - Single Tenant for Phase 1A)
-- =====================================================================

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255),
  business_type VARCHAR(20) NOT NULL DEFAULT 'b2c_and_b2b'
    CHECK (business_type IN ('b2c_only', 'b2b_only', 'b2c_and_b2b')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default tenant (Travel2Egypt)
INSERT INTO tenants (company_name, contact_email, business_type)
VALUES ('Travel2Egypt', 'info@travel2egypt.com', 'b2c_and_b2b')
ON CONFLICT DO NOTHING;

-- Create index
CREATE INDEX IF NOT EXISTS idx_tenants_business_type ON tenants(business_type);

-- =====================================================================
-- 2. B2C QUOTES TABLE (NEW)
-- =====================================================================

CREATE TABLE IF NOT EXISTS b2c_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  itinerary_id UUID REFERENCES itineraries(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- Quote identification
  quote_number VARCHAR(50) NOT NULL,

  -- Pricing
  num_travelers INTEGER NOT NULL DEFAULT 2,
  tier VARCHAR(20) NOT NULL DEFAULT 'standard'
    CHECK (tier IN ('budget', 'standard', 'deluxe', 'luxury')),

  total_cost DECIMAL(12,2) NOT NULL,
  margin_percent DECIMAL(5,2) NOT NULL,
  selling_price DECIMAL(12,2) NOT NULL,
  price_per_person DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',

  -- Cost breakdown (JSONB for flexibility)
  cost_breakdown JSONB,
  /*
  Example structure:
  {
    "accommodation": 1200.00,
    "transportation": 450.00,
    "entrance_fees": 180.00,
    "guide": 300.00,
    "meals": 150.00,
    "tips": 80.00,
    "flights": 400.00,
    "miscellaneous": 50.00
  }
  */

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired')),

  -- Validity
  valid_until DATE,

  -- Delivery tracking
  sent_via VARCHAR(20),  -- 'whatsapp', 'email', 'manual'
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,

  -- PDF storage
  pdf_url TEXT,

  -- Notes
  internal_notes TEXT,  -- Private notes for staff
  client_notes TEXT,    -- Notes visible to client

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(quote_number)
);

-- Create indexes for B2C quotes
CREATE INDEX IF NOT EXISTS idx_b2c_quotes_tenant ON b2c_quotes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_b2c_quotes_itinerary ON b2c_quotes(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_b2c_quotes_client ON b2c_quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_b2c_quotes_status ON b2c_quotes(status);
CREATE INDEX IF NOT EXISTS idx_b2c_quotes_created ON b2c_quotes(created_at DESC);

-- =====================================================================
-- 3. B2B QUOTES TABLE (NEW)
-- =====================================================================

CREATE TABLE IF NOT EXISTS b2b_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  itinerary_id UUID REFERENCES itineraries(id) ON DELETE CASCADE,
  partner_id UUID REFERENCES b2b_partners(id) ON DELETE SET NULL,

  -- Quote identification
  quote_number VARCHAR(50) NOT NULL,

  -- Pricing configuration
  tier VARCHAR(20) NOT NULL DEFAULT 'standard'
    CHECK (tier IN ('budget', 'standard', 'deluxe', 'luxury')),
  tour_leader_included BOOLEAN NOT NULL DEFAULT false,
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',

  -- PPD (Per Person Double) breakdown
  ppd_accommodation DECIMAL(10,2) NOT NULL DEFAULT 0,  -- Hotel/accommodation PPD
  ppd_cruise DECIMAL(10,2) NOT NULL DEFAULT 0,         -- Nile cruise PPD
  single_supplement DECIMAL(10,2) NOT NULL DEFAULT 0,  -- Extra cost for single room

  -- Fixed costs (per trip, not per person)
  fixed_transport DECIMAL(10,2) NOT NULL DEFAULT 0,    -- Vehicle costs
  fixed_guide DECIMAL(10,2) NOT NULL DEFAULT 0,        -- Guide daily rates
  fixed_other DECIMAL(10,2) NOT NULL DEFAULT 0,        -- Other fixed costs

  -- Per-person costs (non-accommodation)
  pp_entrance_fees DECIMAL(10,2) NOT NULL DEFAULT 0,   -- Entrance fees per person
  pp_meals DECIMAL(10,2) NOT NULL DEFAULT 0,           -- Meals per person
  pp_tips DECIMAL(10,2) NOT NULL DEFAULT 0,            -- Tips per person
  pp_domestic_flights DECIMAL(10,2) NOT NULL DEFAULT 0,-- Domestic flights per person

  -- Multi-pax pricing table (JSONB)
  pricing_table JSONB NOT NULL,
  /*
  Example structure:
  {
    "2": { "pp": 1250.00, "total": 2500.00 },
    "4": { "pp": 980.00, "total": 3920.00 },
    "6": { "pp": 850.00, "total": 5100.00 },
    "8": { "pp": 780.00, "total": 6240.00 },
    "10": { "pp": 720.00, "total": 7200.00 },
    "15": { "pp": 650.00, "total": 9750.00 },
    "20": { "pp": 600.00, "total": 12000.00 },
    "25": { "pp": 570.00, "total": 14250.00 },
    "30": { "pp": 550.00, "total": 16500.00 }
  }
  */

  -- Tour leader costs (if included)
  tour_leader_cost DECIMAL(10,2) DEFAULT 0,  -- Total TL cost distributed among pax

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),

  -- Validity period
  valid_from DATE,
  valid_until DATE,
  season VARCHAR(50),  -- e.g., "High Season 2026", "Low Season 2026"

  -- PDF storage
  pdf_url TEXT,

  -- Notes
  internal_notes TEXT,        -- Private notes for staff
  terms_and_conditions TEXT,  -- T&C for partner

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(quote_number)
);

-- Create indexes for B2B quotes
CREATE INDEX IF NOT EXISTS idx_b2b_quotes_tenant ON b2b_quotes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_b2b_quotes_itinerary ON b2b_quotes(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_b2b_quotes_partner ON b2b_quotes(partner_id);
CREATE INDEX IF NOT EXISTS idx_b2b_quotes_status ON b2b_quotes(status);
CREATE INDEX IF NOT EXISTS idx_b2b_quotes_created ON b2b_quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_b2b_quotes_valid ON b2b_quotes(valid_until);

-- =====================================================================
-- 4. QUOTE NUMBER SEQUENCES & GENERATION FUNCTIONS
-- =====================================================================

-- Sequence for B2C quotes
CREATE SEQUENCE IF NOT EXISTS b2c_quote_seq START 1;

-- Sequence for B2B quotes
CREATE SEQUENCE IF NOT EXISTS b2b_quote_seq START 1;

-- Function to generate B2C quote number
CREATE OR REPLACE FUNCTION generate_b2c_quote_number()
RETURNS VARCHAR(50) AS $$
DECLARE
  v_year VARCHAR(4);
  v_seq INTEGER;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::VARCHAR;
  v_seq := nextval('b2c_quote_seq');
  RETURN 'Q-' || v_year || '-' || LPAD(v_seq::VARCHAR, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to generate B2B quote number
CREATE OR REPLACE FUNCTION generate_b2b_quote_number()
RETURNS VARCHAR(50) AS $$
DECLARE
  v_year VARCHAR(4);
  v_seq INTEGER;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::VARCHAR;
  v_seq := nextval('b2b_quote_seq');
  RETURN 'B2B-' || v_year || '-' || LPAD(v_seq::VARCHAR, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 5. UPDATE EXISTING TABLES (Add tenant_id)
-- =====================================================================

-- Add tenant_id to itineraries if doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'itineraries' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE itineraries ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
END $$;

-- Add source tracking columns to itineraries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'itineraries' AND column_name = 'source'
  ) THEN
    ALTER TABLE itineraries ADD COLUMN source VARCHAR(50) DEFAULT 'parser'
      CHECK (source IN ('parser', 'manual', 'template', 'clone'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'itineraries' AND column_name = 'source_conversation'
  ) THEN
    ALTER TABLE itineraries ADD COLUMN source_conversation TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'itineraries' AND column_name = 'ai_model'
  ) THEN
    ALTER TABLE itineraries ADD COLUMN ai_model VARCHAR(100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'itineraries' AND column_name = 'generation_mode'
  ) THEN
    ALTER TABLE itineraries ADD COLUMN generation_mode VARCHAR(20)
      CHECK (generation_mode IN ('creative', 'structured'));
  END IF;
END $$;

-- Set default tenant for existing itineraries
UPDATE itineraries
SET tenant_id = (SELECT id FROM tenants LIMIT 1)
WHERE tenant_id IS NULL;

-- Make tenant_id required on itineraries
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'itineraries'
    AND column_name = 'tenant_id'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE itineraries ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;

-- Add tenant_id to b2b_partners if doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'b2b_partners' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE b2b_partners ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
END $$;

-- Set default tenant for existing b2b_partners
UPDATE b2b_partners
SET tenant_id = (SELECT id FROM tenants LIMIT 1)
WHERE tenant_id IS NULL;

-- Make tenant_id required on b2b_partners
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'b2b_partners'
    AND column_name = 'tenant_id'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE b2b_partners ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;

-- Create index on tenant_id columns
CREATE INDEX IF NOT EXISTS idx_itineraries_tenant ON itineraries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_b2b_partners_tenant ON b2b_partners(tenant_id);

-- =====================================================================
-- 6. UPDATED_AT TRIGGER FUNCTION
-- =====================================================================

-- Create updated_at trigger function if doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tenants
DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to b2c_quotes
DROP TRIGGER IF EXISTS update_b2c_quotes_updated_at ON b2c_quotes;
CREATE TRIGGER update_b2c_quotes_updated_at
  BEFORE UPDATE ON b2c_quotes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to b2b_quotes
DROP TRIGGER IF EXISTS update_b2b_quotes_updated_at ON b2b_quotes;
CREATE TRIGGER update_b2b_quotes_updated_at
  BEFORE UPDATE ON b2b_quotes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- 7. VERIFICATION QUERIES (Run these after migration to verify)
-- =====================================================================

-- To run after migration:
/*

-- Check tenants
SELECT * FROM tenants;

-- Check quote number generation
SELECT generate_b2c_quote_number() as b2c_quote_number,
       generate_b2b_quote_number() as b2b_quote_number;

-- Verify table structures
\d+ b2c_quotes
\d+ b2b_quotes

-- Check if itineraries have tenant_id
SELECT COUNT(*) as itinerary_count,
       COUNT(tenant_id) as with_tenant_count
FROM itineraries;

-- Check if b2b_partners have tenant_id
SELECT COUNT(*) as partner_count,
       COUNT(tenant_id) as with_tenant_count
FROM b2b_partners;

*/

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

-- Output success message
DO $$
BEGIN
  RAISE NOTICE 'Phase 1A Migration Complete!';
  RAISE NOTICE '✅ Created: tenants table';
  RAISE NOTICE '✅ Created: b2c_quotes table';
  RAISE NOTICE '✅ Created: b2b_quotes table';
  RAISE NOTICE '✅ Created: Quote number sequences & functions';
  RAISE NOTICE '✅ Updated: itineraries table (added tenant_id + tracking fields)';
  RAISE NOTICE '✅ Updated: b2b_partners table (added tenant_id)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Run verification queries to check tables';
  RAISE NOTICE '2. Proceed to Step 2: Create API routes';
END $$;
