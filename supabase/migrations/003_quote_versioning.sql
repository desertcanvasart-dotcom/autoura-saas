-- ============================================
-- QUOTE VERSIONING SYSTEM
-- Migration 003: Track quote change history
-- ============================================

-- Create quote_versions table
CREATE TABLE IF NOT EXISTS quote_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference to the quote (polymorphic)
  quote_type VARCHAR(10) NOT NULL CHECK (quote_type IN ('b2c', 'b2b')),
  quote_id UUID NOT NULL,

  -- Multi-tenancy
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Version metadata
  version_number INTEGER NOT NULL,
  is_current BOOLEAN DEFAULT false,

  -- Complete snapshot of quote data at this version
  quote_data JSONB NOT NULL,

  -- Change tracking
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  change_reason TEXT,
  change_summary TEXT, -- Brief description of what changed

  -- Diff from previous version (optional)
  changes_diff JSONB, -- {field: {old: value, new: value}}

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure version numbers are sequential per quote
  UNIQUE(quote_type, quote_id, version_number)
);

-- Indexes for performance
CREATE INDEX idx_quote_versions_quote ON quote_versions(quote_type, quote_id);
CREATE INDEX idx_quote_versions_tenant ON quote_versions(tenant_id);
CREATE INDEX idx_quote_versions_current ON quote_versions(is_current) WHERE is_current = true;
CREATE INDEX idx_quote_versions_changed_by ON quote_versions(changed_by);
CREATE INDEX idx_quote_versions_changed_at ON quote_versions(changed_at DESC);

-- Add version tracking columns to existing quote tables
ALTER TABLE b2c_quotes
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_modified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMPTZ;

ALTER TABLE b2b_quotes
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_modified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMPTZ;

-- ============================================
-- FUNCTIONS FOR VERSION MANAGEMENT
-- ============================================

-- Function to create a version snapshot for B2C quotes
CREATE OR REPLACE FUNCTION create_b2c_quote_version(
  p_quote_id UUID,
  p_changed_by UUID,
  p_change_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_quote RECORD;
  v_version_number INTEGER;
  v_version_id UUID;
  v_previous_version RECORD;
  v_changes_diff JSONB;
BEGIN
  -- Get the current quote data
  SELECT * INTO v_quote FROM b2c_quotes WHERE id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found: %', p_quote_id;
  END IF;

  -- Get the next version number
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_version_number
  FROM quote_versions
  WHERE quote_type = 'b2c' AND quote_id = p_quote_id;

  -- Get previous version for diff calculation
  SELECT quote_data INTO v_previous_version
  FROM quote_versions
  WHERE quote_type = 'b2c' AND quote_id = p_quote_id
  ORDER BY version_number DESC
  LIMIT 1;

  -- Calculate diff (simplified - you can enhance this)
  IF v_previous_version IS NOT NULL THEN
    v_changes_diff := jsonb_build_object(
      'status_changed', (v_previous_version.quote_data->>'status') != v_quote.status::text,
      'price_changed', (v_previous_version.quote_data->>'selling_price')::numeric != v_quote.selling_price,
      'margin_changed', (v_previous_version.quote_data->>'margin_percent')::numeric != v_quote.margin_percent
    );
  END IF;

  -- Mark previous version as not current
  UPDATE quote_versions
  SET is_current = false
  WHERE quote_type = 'b2c' AND quote_id = p_quote_id;

  -- Insert new version
  INSERT INTO quote_versions (
    quote_type,
    quote_id,
    tenant_id,
    version_number,
    is_current,
    quote_data,
    changed_by,
    change_reason,
    changes_diff
  ) VALUES (
    'b2c',
    p_quote_id,
    v_quote.tenant_id,
    v_version_number,
    true,
    to_jsonb(v_quote),
    p_changed_by,
    p_change_reason,
    v_changes_diff
  )
  RETURNING id INTO v_version_id;

  -- Update quote version number
  UPDATE b2c_quotes
  SET
    version = v_version_number,
    last_modified_by = p_changed_by,
    last_modified_at = NOW()
  WHERE id = p_quote_id;

  RETURN v_version_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a version snapshot for B2B quotes
CREATE OR REPLACE FUNCTION create_b2b_quote_version(
  p_quote_id UUID,
  p_changed_by UUID,
  p_change_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_quote RECORD;
  v_version_number INTEGER;
  v_version_id UUID;
  v_previous_version RECORD;
  v_changes_diff JSONB;
BEGIN
  -- Get the current quote data
  SELECT * INTO v_quote FROM b2b_quotes WHERE id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found: %', p_quote_id;
  END IF;

  -- Get the next version number
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_version_number
  FROM quote_versions
  WHERE quote_type = 'b2b' AND quote_id = p_quote_id;

  -- Get previous version for diff calculation
  SELECT quote_data INTO v_previous_version
  FROM quote_versions
  WHERE quote_type = 'b2b' AND quote_id = p_quote_id
  ORDER BY version_number DESC
  LIMIT 1;

  -- Calculate diff (simplified)
  IF v_previous_version IS NOT NULL THEN
    v_changes_diff := jsonb_build_object(
      'status_changed', (v_previous_version.quote_data->>'status') != v_quote.status::text,
      'tier_changed', (v_previous_version.quote_data->>'tier') != v_quote.tier::text,
      'pricing_changed', (v_previous_version.quote_data->>'pricing_table')::text != v_quote.pricing_table::text
    );
  END IF;

  -- Mark previous version as not current
  UPDATE quote_versions
  SET is_current = false
  WHERE quote_type = 'b2b' AND quote_id = p_quote_id;

  -- Insert new version
  INSERT INTO quote_versions (
    quote_type,
    quote_id,
    tenant_id,
    version_number,
    is_current,
    quote_data,
    changed_by,
    change_reason,
    changes_diff
  ) VALUES (
    'b2b',
    p_quote_id,
    v_quote.tenant_id,
    v_version_number,
    true,
    to_jsonb(v_quote),
    p_changed_by,
    p_change_reason,
    v_changes_diff
  )
  RETURNING id INTO v_version_id;

  -- Update quote version number
  UPDATE b2b_quotes
  SET
    version = v_version_number,
    last_modified_by = p_changed_by,
    last_modified_at = NOW()
  WHERE id = p_quote_id;

  RETURN v_version_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to revert B2C quote to a previous version
CREATE OR REPLACE FUNCTION revert_b2c_quote_to_version(
  p_quote_id UUID,
  p_version_number INTEGER,
  p_reverted_by UUID,
  p_revert_reason TEXT DEFAULT 'Reverted to previous version'
)
RETURNS UUID AS $$
DECLARE
  v_version_data JSONB;
  v_new_version_id UUID;
BEGIN
  -- Get the version data
  SELECT quote_data INTO v_version_data
  FROM quote_versions
  WHERE quote_type = 'b2c'
    AND quote_id = p_quote_id
    AND version_number = p_version_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version not found: quote_id=%, version=%', p_quote_id, p_version_number;
  END IF;

  -- Update the quote with version data
  UPDATE b2c_quotes
  SET
    num_travelers = (v_version_data->>'num_travelers')::integer,
    tier = v_version_data->>'tier',
    total_cost = (v_version_data->>'total_cost')::numeric,
    margin_percent = (v_version_data->>'margin_percent')::numeric,
    selling_price = (v_version_data->>'selling_price')::numeric,
    price_per_person = (v_version_data->>'price_per_person')::numeric,
    currency = v_version_data->>'currency',
    cost_breakdown = v_version_data->'cost_breakdown',
    status = v_version_data->>'status',
    valid_until = (v_version_data->>'valid_until')::date,
    internal_notes = v_version_data->>'internal_notes',
    client_notes = v_version_data->>'client_notes',
    updated_at = NOW()
  WHERE id = p_quote_id;

  -- Create a new version for the revert
  SELECT create_b2c_quote_version(
    p_quote_id,
    p_reverted_by,
    p_revert_reason || ' (v' || p_version_number || ')'
  ) INTO v_new_version_id;

  RETURN v_new_version_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to revert B2B quote to a previous version
CREATE OR REPLACE FUNCTION revert_b2b_quote_to_version(
  p_quote_id UUID,
  p_version_number INTEGER,
  p_reverted_by UUID,
  p_revert_reason TEXT DEFAULT 'Reverted to previous version'
)
RETURNS UUID AS $$
DECLARE
  v_version_data JSONB;
  v_new_version_id UUID;
BEGIN
  -- Get the version data
  SELECT quote_data INTO v_version_data
  FROM quote_versions
  WHERE quote_type = 'b2b'
    AND quote_id = p_quote_id
    AND version_number = p_version_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version not found: quote_id=%, version=%', p_quote_id, p_version_number;
  END IF;

  -- Update the quote with version data
  UPDATE b2b_quotes
  SET
    tier = v_version_data->>'tier',
    tour_leader_included = (v_version_data->>'tour_leader_included')::boolean,
    currency = v_version_data->>'currency',
    ppd_accommodation = (v_version_data->>'ppd_accommodation')::numeric,
    ppd_cruise = (v_version_data->>'ppd_cruise')::numeric,
    single_supplement = (v_version_data->>'single_supplement')::numeric,
    fixed_transport = (v_version_data->>'fixed_transport')::numeric,
    fixed_guide = (v_version_data->>'fixed_guide')::numeric,
    fixed_other = (v_version_data->>'fixed_other')::numeric,
    pp_entrance_fees = (v_version_data->>'pp_entrance_fees')::numeric,
    pp_meals = (v_version_data->>'pp_meals')::numeric,
    pp_tips = (v_version_data->>'pp_tips')::numeric,
    pp_domestic_flights = (v_version_data->>'pp_domestic_flights')::numeric,
    pricing_table = v_version_data->'pricing_table',
    tour_leader_cost = (v_version_data->>'tour_leader_cost')::numeric,
    status = v_version_data->>'status',
    valid_from = (v_version_data->>'valid_from')::date,
    valid_until = (v_version_data->>'valid_until')::date,
    season = v_version_data->>'season',
    internal_notes = v_version_data->>'internal_notes',
    terms_and_conditions = v_version_data->>'terms_and_conditions',
    updated_at = NOW()
  WHERE id = p_quote_id;

  -- Create a new version for the revert
  SELECT create_b2b_quote_version(
    p_quote_id,
    p_reverted_by,
    p_revert_reason || ' (v' || p_version_number || ')'
  ) INTO v_new_version_id;

  RETURN v_new_version_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

ALTER TABLE quote_versions ENABLE ROW LEVEL SECURITY;

-- Users can view versions for their tenant's quotes
CREATE POLICY "Users can view tenant quote versions" ON quote_versions
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Only admins/managers can create versions (though this is usually done via functions)
CREATE POLICY "Admins can create quote versions" ON quote_versions
  FOR INSERT
  WITH CHECK (
    tenant_id = get_user_tenant_id() AND
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE user_id = auth.uid()
        AND tenant_id = quote_versions.tenant_id
        AND role IN ('owner', 'admin', 'manager')
        AND status = 'active'
    )
  );

-- No direct updates or deletes (versions are immutable)
CREATE POLICY "Quote versions are immutable" ON quote_versions
  FOR UPDATE
  USING (false);

CREATE POLICY "Quote versions cannot be deleted" ON quote_versions
  FOR DELETE
  USING (false);

-- ============================================
-- INITIAL VERSION SNAPSHOTS
-- ============================================

-- Create initial version snapshots for existing quotes
-- (Run this after migration to capture current state)

DO $$
DECLARE
  v_quote RECORD;
BEGIN
  -- Create initial versions for B2C quotes
  FOR v_quote IN SELECT id FROM b2c_quotes LOOP
    PERFORM create_b2c_quote_version(
      v_quote.id,
      NULL, -- No user for initial version
      'Initial version snapshot'
    );
  END LOOP;

  -- Create initial versions for B2B quotes
  FOR v_quote IN SELECT id FROM b2b_quotes LOOP
    PERFORM create_b2b_quote_version(
      v_quote.id,
      NULL,
      'Initial version snapshot'
    );
  END LOOP;
END $$;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE quote_versions IS 'Stores complete version history of all quotes (B2C and B2B) for audit trail and revert capabilities';
COMMENT ON COLUMN quote_versions.quote_type IS 'Type of quote: b2c or b2b';
COMMENT ON COLUMN quote_versions.quote_data IS 'Complete snapshot of quote data as JSONB for this version';
COMMENT ON COLUMN quote_versions.is_current IS 'True if this is the current active version';
COMMENT ON COLUMN quote_versions.changes_diff IS 'Summary of what changed from previous version';
COMMENT ON FUNCTION create_b2c_quote_version IS 'Creates a new version snapshot of a B2C quote';
COMMENT ON FUNCTION create_b2b_quote_version IS 'Creates a new version snapshot of a B2B quote';
COMMENT ON FUNCTION revert_b2c_quote_to_version IS 'Reverts a B2C quote to a previous version';
COMMENT ON FUNCTION revert_b2b_quote_to_version IS 'Reverts a B2B quote to a previous version';
