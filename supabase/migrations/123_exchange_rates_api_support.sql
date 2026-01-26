-- Migration: Add API support for exchange rates
-- Allows system-level rates (shared across tenants) with tenant overrides

-- Make tenant_id nullable for system-level rates
ALTER TABLE exchange_rates ALTER COLUMN tenant_id DROP NOT NULL;

-- Add columns for API tracking
ALTER TABLE exchange_rates ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual'
  CHECK (source IN ('manual', 'api'));
ALTER TABLE exchange_rates ADD COLUMN IF NOT EXISTS api_fetched_at TIMESTAMPTZ;

-- Update unique constraint to allow both system-level and tenant-level rates
-- Drop old constraint first (if exists)
ALTER TABLE exchange_rates DROP CONSTRAINT IF EXISTS exchange_rates_tenant_id_base_currency_target_currency_key;

-- Create new unique index that handles NULL tenant_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_exchange_rates_unique
ON exchange_rates (
  COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  base_currency,
  target_currency
);

-- Update RLS policy to allow reading system-level rates (tenant_id IS NULL)
DROP POLICY IF EXISTS "Users can view exchange rates for their tenant" ON exchange_rates;

CREATE POLICY "Users can view exchange rates"
ON exchange_rates FOR SELECT
USING (
  -- System-level rates (shared) are viewable by all authenticated users
  tenant_id IS NULL
  OR
  -- Tenant-specific rates viewable by tenant members
  tenant_id IN (
    SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
  )
);

-- Keep admin policy for managing rates
DROP POLICY IF EXISTS "Admins can manage exchange rates" ON exchange_rates;

CREATE POLICY "Admins can manage tenant exchange rates"
ON exchange_rates FOR ALL
USING (
  -- Only tenant-specific rates can be managed by tenant admins
  tenant_id IS NOT NULL
  AND tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- Add policy for service role to manage system-level rates
-- (This allows our API to update shared rates)
CREATE POLICY "Service role can manage system rates"
ON exchange_rates FOR ALL
USING (
  -- Allow service role to manage system-level rates
  tenant_id IS NULL AND auth.role() = 'service_role'
)
WITH CHECK (
  tenant_id IS NULL AND auth.role() = 'service_role'
);

-- Insert system-level rates (tenant_id = NULL)
-- These will be updated by the API
INSERT INTO exchange_rates (tenant_id, base_currency, target_currency, rate, source)
VALUES
  (NULL, 'EUR', 'USD', 1.08, 'api'),
  (NULL, 'EUR', 'GBP', 0.86, 'api'),
  (NULL, 'EUR', 'EGP', 53.50, 'api'),
  (NULL, 'USD', 'EUR', 0.926, 'api'),
  (NULL, 'GBP', 'EUR', 1.163, 'api'),
  (NULL, 'EGP', 'EUR', 0.0187, 'api')
ON CONFLICT DO NOTHING;

-- Create a view for easy rate lookup (prefers tenant rates over system rates)
CREATE OR REPLACE VIEW effective_exchange_rates AS
SELECT DISTINCT ON (
  COALESCE(er.tenant_id, tm.tenant_id),
  er.base_currency,
  er.target_currency
)
  COALESCE(er.tenant_id, tm.tenant_id) as effective_tenant_id,
  er.base_currency,
  er.target_currency,
  er.rate,
  er.source,
  er.is_active,
  er.last_updated_at,
  er.api_fetched_at,
  CASE WHEN er.tenant_id IS NULL THEN false ELSE true END as is_tenant_override
FROM exchange_rates er
LEFT JOIN tenant_members tm ON er.tenant_id IS NULL
WHERE er.is_active = true
ORDER BY
  COALESCE(er.tenant_id, tm.tenant_id),
  er.base_currency,
  er.target_currency,
  er.tenant_id NULLS LAST; -- Prefer tenant-specific rates over system rates
