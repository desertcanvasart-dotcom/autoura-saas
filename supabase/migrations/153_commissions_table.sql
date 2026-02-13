-- =====================================================================
-- Migration 153: Commissions Table (retroactive documentation)
-- Description: Documents the commissions table that was created directly
--              in the SQL Editor. Tracks B2B commission payments for
--              suppliers, agents, and partners on itineraries.
-- Date: 2026-02-13
-- NOTE: This table already exists in production — using IF NOT EXISTS
-- =====================================================================

CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,

  -- Relationships
  itinerary_id UUID REFERENCES itineraries(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- Commission details
  commission_type VARCHAR(50),           -- e.g. 'agent', 'supplier', 'referral'
  category VARCHAR(100),                 -- e.g. 'cruise', 'hotel', 'transport'
  source_name VARCHAR(255),              -- Name of the commission source
  source_contact VARCHAR(255),           -- Contact info for the source
  description TEXT,

  -- Financial
  base_amount DECIMAL(12,2) DEFAULT 0,   -- Original service amount
  commission_rate DECIMAL(5,2) DEFAULT 0, -- Commission percentage
  commission_amount DECIMAL(12,2) DEFAULT 0, -- Calculated commission
  currency VARCHAR(10) DEFAULT 'EUR',

  -- Status & dates
  status VARCHAR(50) DEFAULT 'pending',  -- pending, approved, paid, cancelled
  transaction_date DATE,
  due_date DATE,
  paid_date DATE,

  -- Payment info
  payment_method VARCHAR(50),            -- bank_transfer, cash, check, etc.
  payment_reference VARCHAR(255),

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_commissions_tenant_id ON commissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_commissions_itinerary_id ON commissions(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_commissions_supplier_id ON commissions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_commissions_client_id ON commissions(client_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);
CREATE INDEX IF NOT EXISTS idx_commissions_transaction_date ON commissions(transaction_date);

-- RLS
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'commissions' AND policyname = 'commissions_tenant_isolation'
  ) THEN
    CREATE POLICY commissions_tenant_isolation ON commissions
      FOR ALL
      USING (tenant_id = get_primary_tenant_id())
      WITH CHECK (tenant_id = get_primary_tenant_id());
  END IF;
END $$;

-- Comments
COMMENT ON TABLE commissions IS 'Tracks B2B commissions for suppliers, agents, and partners on travel itineraries';
COMMENT ON COLUMN commissions.commission_type IS 'Type: agent, supplier, referral, etc.';
COMMENT ON COLUMN commissions.base_amount IS 'Original service cost before commission';
COMMENT ON COLUMN commissions.commission_rate IS 'Commission percentage (e.g. 10.00 = 10%)';
COMMENT ON COLUMN commissions.commission_amount IS 'Calculated commission amount in specified currency';
