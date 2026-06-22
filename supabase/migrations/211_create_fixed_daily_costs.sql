-- =====================================================================
-- Migration 211: Create fixed_daily_costs Table
-- Description: Per-person-per-day fixed operational costs (e.g. bottled
--              water) that the pricing engine adds automatically. Backs the
--              existing admin UI at app/rates/fixed-costs (which already
--              read/wrote this table, but the table was never created in a
--              migration) and lets the engine read the rate instead of
--              hardcoding it.
-- Mirrors the tipping_rates pattern (migration 111).
-- Date: 2026-06-22
-- =====================================================================

-- =====================================================================
-- 1. CREATE TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS fixed_daily_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- Cost identification (matches the admin API + lib/fixed-costs.ts lookups)
  cost_type VARCHAR(100) NOT NULL,

  -- Pricing
  cost_per_person_per_day DECIMAL(10, 2) NOT NULL DEFAULT 0,

  -- Additional info
  description TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 2. INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_fixed_daily_costs_tenant_id ON fixed_daily_costs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fixed_daily_costs_cost_type ON fixed_daily_costs(cost_type);
CREATE INDEX IF NOT EXISTS idx_fixed_daily_costs_is_active ON fixed_daily_costs(is_active);

-- =====================================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================================

ALTER TABLE fixed_daily_costs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see fixed costs for their tenant (or global NULL-tenant defaults)
CREATE POLICY fixed_daily_costs_tenant_isolation ON fixed_daily_costs
  FOR ALL
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());

-- Policy: Service role can access all (used by the pricing engine reader)
CREATE POLICY fixed_daily_costs_service_role ON fixed_daily_costs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================================
-- 4. UPDATED_AT TRIGGER
-- =====================================================================

CREATE OR REPLACE FUNCTION update_fixed_daily_costs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_fixed_daily_costs_updated_at ON fixed_daily_costs;
CREATE TRIGGER trigger_fixed_daily_costs_updated_at
  BEFORE UPDATE ON fixed_daily_costs
  FOR EACH ROW
  EXECUTE FUNCTION update_fixed_daily_costs_updated_at();

-- =====================================================================
-- 5. SEED DATA - preserve the engine's previous hardcoded water cost (€2)
-- Global default (tenant_id NULL) so it applies until a tenant overrides it.
-- Idempotent: only inserts if a global Water Bottle row doesn't already exist.
-- =====================================================================

INSERT INTO fixed_daily_costs (tenant_id, cost_type, cost_per_person_per_day, description, is_active)
SELECT NULL, 'Water Bottle', 2.00, 'Bottled water per traveler per sightseeing day', true
WHERE NOT EXISTS (
  SELECT 1 FROM fixed_daily_costs WHERE cost_type = 'Water Bottle' AND tenant_id IS NULL
);

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM fixed_daily_costs;
  RAISE NOTICE 'Migration 211 complete — fixed_daily_costs created, % row(s) present', row_count;
END $$;
