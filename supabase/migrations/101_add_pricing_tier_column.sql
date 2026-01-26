-- Add current_pricing_tier column to tenant_features table
ALTER TABLE tenant_features
ADD COLUMN IF NOT EXISTS current_pricing_tier VARCHAR(20) DEFAULT 'professional'
  CHECK (current_pricing_tier IN ('starter', 'professional', 'business', 'enterprise'));

-- Update existing records to have professional tier
UPDATE tenant_features
SET current_pricing_tier = 'professional'
WHERE current_pricing_tier IS NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tenant_features_pricing_tier
ON tenant_features(current_pricing_tier);

-- Add comment
COMMENT ON COLUMN tenant_features.current_pricing_tier IS 'Current pricing tier for the tenant';
