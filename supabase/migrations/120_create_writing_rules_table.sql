-- =====================================================================
-- Migration 120: Create writing_rules table for Content Library
-- Description: Stores writing guidelines for content creation
-- Date: 2026-01-26
-- =====================================================================

-- Create writing_rules table
CREATE TABLE IF NOT EXISTS writing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- Rule identification
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100),
  category VARCHAR(50), -- 'tone', 'formatting', 'tier-specific', 'general'

  -- Rule content
  description TEXT NOT NULL,
  examples TEXT[], -- Array of example texts

  -- Applicability
  applies_to_tiers TEXT[] DEFAULT ARRAY['budget', 'standard', 'deluxe', 'luxury'],
  applies_to_categories TEXT[], -- content category slugs, null = all

  -- Status
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  updated_by UUID
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_writing_rules_tenant ON writing_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_writing_rules_category ON writing_rules(category);
CREATE INDEX IF NOT EXISTS idx_writing_rules_is_active ON writing_rules(is_active);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_writing_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_writing_rules_updated_at ON writing_rules;
CREATE TRIGGER trigger_writing_rules_updated_at
  BEFORE UPDATE ON writing_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_writing_rules_updated_at();

-- Insert default writing rules
INSERT INTO writing_rules (tenant_id, name, category, description, examples, applies_to_tiers, sort_order)
SELECT
  t.id,
  rule.name,
  rule.category,
  rule.description,
  rule.examples,
  rule.applies_to_tiers,
  rule.sort_order
FROM tenants t
CROSS JOIN (VALUES
  ('Use Active Voice', 'tone',
   'Write in active voice to create engaging, dynamic descriptions. Avoid passive constructions.',
   ARRAY['Active: "Your guide leads you through ancient temples"', 'Passive (avoid): "You will be led through ancient temples"'],
   ARRAY['budget', 'standard', 'deluxe', 'luxury'], 1),

  ('Tier-Appropriate Language', 'tier-specific',
   'Match vocabulary and tone to the tier level. Budget uses practical language, Luxury uses sophisticated vocabulary.',
   ARRAY['Budget: "comfortable hotel with good amenities"', 'Luxury: "exquisite boutique property with impeccable service"'],
   ARRAY['budget', 'standard', 'deluxe', 'luxury'], 2),

  ('Sensory Details', 'tone',
   'Include sensory descriptions to bring experiences to life - sights, sounds, scents, textures.',
   ARRAY['Example: "The golden light of sunset illuminates the ancient stones as the call to prayer echoes across the Nile"'],
   ARRAY['standard', 'deluxe', 'luxury'], 3),

  ('Specific Over Generic', 'general',
   'Use specific details rather than generic descriptions. Name places, describe unique features.',
   ARRAY['Generic (avoid): "Visit a nice restaurant"', 'Specific: "Dine at Naguib Mahfouz café in the heart of Khan el-Khalili"'],
   ARRAY['budget', 'standard', 'deluxe', 'luxury'], 4),

  ('Avoid Superlatives', 'formatting',
   'Limit use of superlatives like "best", "most amazing", "greatest". Let descriptions speak for themselves.',
   ARRAY['Avoid: "The most amazing temple in Egypt"', 'Better: "Karnak Temple, with its 134 towering columns spanning 5,000 years of history"'],
   ARRAY['budget', 'standard', 'deluxe', 'luxury'], 5)
) AS rule(name, category, description, examples, applies_to_tiers, sort_order)
LIMIT 5;

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  rule_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO rule_count FROM writing_rules;

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 120 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Created writing_rules table';
  RAISE NOTICE 'Added % default writing rules', rule_count;
  RAISE NOTICE '';
END $$;
