-- Migration: Create exchange rates table for currency conversion
-- This allows the system to convert rates between currencies

-- Create exchange_rates table
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  base_currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  target_currency VARCHAR(3) NOT NULL,
  rate DECIMAL(12, 6) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, base_currency, target_currency)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_exchange_rates_tenant ON exchange_rates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_currencies ON exchange_rates(base_currency, target_currency);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_active ON exchange_rates(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view exchange rates for their tenant"
ON exchange_rates FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage exchange rates"
ON exchange_rates FOR ALL
USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- Insert default exchange rates (EUR as base currency)
-- These are approximate rates - users should update with current rates
INSERT INTO exchange_rates (tenant_id, base_currency, target_currency, rate)
SELECT
  t.id,
  'EUR',
  rates.currency,
  rates.rate
FROM tenants t
CROSS JOIN (
  VALUES
    ('USD'::VARCHAR(3), 1.08::DECIMAL(12,6)),    -- 1 EUR = 1.08 USD
    ('GBP'::VARCHAR(3), 0.86::DECIMAL(12,6)),    -- 1 EUR = 0.86 GBP
    ('EGP'::VARCHAR(3), 53.50::DECIMAL(12,6))    -- 1 EUR = 53.50 EGP
) AS rates(currency, rate)
ON CONFLICT (tenant_id, base_currency, target_currency) DO NOTHING;

-- Also insert reverse rates for convenience
INSERT INTO exchange_rates (tenant_id, base_currency, target_currency, rate)
SELECT
  t.id,
  'USD',
  'EUR',
  0.926  -- 1 USD = 0.926 EUR
FROM tenants t
ON CONFLICT (tenant_id, base_currency, target_currency) DO NOTHING;

INSERT INTO exchange_rates (tenant_id, base_currency, target_currency, rate)
SELECT
  t.id,
  'GBP',
  'EUR',
  1.163  -- 1 GBP = 1.163 EUR
FROM tenants t
ON CONFLICT (tenant_id, base_currency, target_currency) DO NOTHING;

INSERT INTO exchange_rates (tenant_id, base_currency, target_currency, rate)
SELECT
  t.id,
  'EGP',
  'EUR',
  0.0187  -- 1 EGP = 0.0187 EUR
FROM tenants t
ON CONFLICT (tenant_id, base_currency, target_currency) DO NOTHING;

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_exchange_rates_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
DROP TRIGGER IF EXISTS exchange_rates_updated_at ON exchange_rates;
CREATE TRIGGER exchange_rates_updated_at
  BEFORE UPDATE ON exchange_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_exchange_rates_timestamp();
