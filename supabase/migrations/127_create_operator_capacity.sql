-- ============================================
-- OPERATOR CAPACITY TABLE
-- File: supabase/migrations/127_create_operator_capacity.sql
--
-- Lightweight capacity management for tour operators
-- Tracks internal resources (guides, vehicles) availability
-- Used by WhatsApp AI to check real availability
-- ============================================

-- Create the operator_capacity table
CREATE TABLE IF NOT EXISTS operator_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Date range for this capacity entry
  date DATE NOT NULL,

  -- Capacity status
  status VARCHAR(20) NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'limited', 'busy', 'blackout')),

  -- Group limits (for multi-group operators)
  max_groups INTEGER NOT NULL DEFAULT 3,
  booked_groups INTEGER NOT NULL DEFAULT 0,

  -- Resource tracking (optional, for more detailed management)
  max_guides INTEGER DEFAULT NULL,
  booked_guides INTEGER DEFAULT 0,
  max_vehicles INTEGER DEFAULT NULL,
  booked_vehicles INTEGER DEFAULT 0,

  -- Notes for staff
  notes TEXT,
  internal_notes TEXT,

  -- Reason for status (useful for blackout dates)
  reason VARCHAR(100),

  -- Tracking
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  -- Ensure unique date per tenant
  UNIQUE(tenant_id, date)
);

-- Create indexes for efficient querying
CREATE INDEX idx_operator_capacity_tenant ON operator_capacity(tenant_id);
CREATE INDEX idx_operator_capacity_date ON operator_capacity(date);
CREATE INDEX idx_operator_capacity_status ON operator_capacity(status);
CREATE INDEX idx_operator_capacity_date_range ON operator_capacity(tenant_id, date, status);

-- Add RLS policies
ALTER TABLE operator_capacity ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view capacity for their tenant
CREATE POLICY "Users can view own tenant capacity"
  ON operator_capacity
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tm.tenant_id
      FROM tenant_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- Policy: Users can insert capacity for their tenant
CREATE POLICY "Users can insert own tenant capacity"
  ON operator_capacity
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tm.tenant_id
      FROM tenant_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- Policy: Users can update capacity for their tenant
CREATE POLICY "Users can update own tenant capacity"
  ON operator_capacity
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tm.tenant_id
      FROM tenant_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- Policy: Users can delete capacity for their tenant
CREATE POLICY "Users can delete own tenant capacity"
  ON operator_capacity
  FOR DELETE
  USING (
    tenant_id IN (
      SELECT tm.tenant_id
      FROM tenant_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- Add updated_at trigger
CREATE TRIGGER update_operator_capacity_updated_at
  BEFORE UPDATE ON operator_capacity
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comment on table
COMMENT ON TABLE operator_capacity IS 'Tracks operator internal capacity (guides, vehicles) for availability checking';
COMMENT ON COLUMN operator_capacity.status IS 'available = open for bookings, limited = some availability, busy = nearly full, blackout = no bookings accepted';
COMMENT ON COLUMN operator_capacity.max_groups IS 'Maximum number of tour groups the operator can handle on this date';
COMMENT ON COLUMN operator_capacity.booked_groups IS 'Number of groups already booked for this date';
