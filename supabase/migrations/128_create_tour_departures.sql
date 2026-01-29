-- ============================================
-- TOUR DEPARTURES TABLE
-- File: supabase/migrations/128_create_tour_departures.sql
--
-- Scheduled tour departures with capacity tracking
-- Used for group tours where customers can join/leave
-- Links to tour_templates for tour definitions
-- ============================================

-- Create the tour_departures table
CREATE TABLE IF NOT EXISTS tour_departures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Link to tour template
  template_id UUID REFERENCES tour_templates(id) ON DELETE SET NULL,
  variation_id UUID REFERENCES tour_variations(id) ON DELETE SET NULL,

  -- Tour info (denormalized for quick access, or custom if no template)
  tour_name VARCHAR(255) NOT NULL,
  tour_code VARCHAR(50),
  duration_days INTEGER NOT NULL DEFAULT 1,

  -- Departure dates
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Capacity
  max_pax INTEGER NOT NULL DEFAULT 20,
  booked_pax INTEGER NOT NULL DEFAULT 0,
  min_pax INTEGER DEFAULT 2,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft', 'open', 'limited', 'full', 'guaranteed', 'cancelled')),

  -- Booking control
  cutoff_days INTEGER DEFAULT 3, -- Days before start_date to stop accepting bookings
  is_guaranteed BOOLEAN DEFAULT false, -- Tour will run regardless of bookings

  -- Pricing (optional override)
  price_per_person DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'EUR',

  -- Guide/Vehicle assignment (optional)
  assigned_guide_id UUID,
  assigned_vehicle_id UUID,

  -- Notes
  public_notes TEXT, -- Visible to customers
  internal_notes TEXT, -- Staff only

  -- Tracking
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  -- Ensure unique departure per tour/date
  UNIQUE(tenant_id, template_id, start_date)
);

-- Create indexes for efficient querying
CREATE INDEX idx_tour_departures_tenant ON tour_departures(tenant_id);
CREATE INDEX idx_tour_departures_template ON tour_departures(template_id);
CREATE INDEX idx_tour_departures_dates ON tour_departures(start_date, end_date);
CREATE INDEX idx_tour_departures_status ON tour_departures(status);
CREATE INDEX idx_tour_departures_upcoming ON tour_departures(tenant_id, start_date, status)
  WHERE status IN ('open', 'limited', 'guaranteed');

-- Add RLS policies
ALTER TABLE tour_departures ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view departures for their tenant
CREATE POLICY "Users can view own tenant departures"
  ON tour_departures
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tm.tenant_id
      FROM tenant_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- Policy: Users can insert departures for their tenant
CREATE POLICY "Users can insert own tenant departures"
  ON tour_departures
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tm.tenant_id
      FROM tenant_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- Policy: Users can update departures for their tenant
CREATE POLICY "Users can update own tenant departures"
  ON tour_departures
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tm.tenant_id
      FROM tenant_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- Policy: Users can delete departures for their tenant
CREATE POLICY "Users can delete own tenant departures"
  ON tour_departures
  FOR DELETE
  USING (
    tenant_id IN (
      SELECT tm.tenant_id
      FROM tenant_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- Add updated_at trigger
CREATE TRIGGER update_tour_departures_updated_at
  BEFORE UPDATE ON tour_departures
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to auto-update status based on capacity
CREATE OR REPLACE FUNCTION update_departure_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-update status based on booked_pax
  IF NEW.booked_pax >= NEW.max_pax THEN
    NEW.status := 'full';
  ELSIF NEW.booked_pax >= (NEW.max_pax * 0.8) THEN
    -- 80% or more = limited
    IF NEW.status NOT IN ('full', 'cancelled') THEN
      NEW.status := 'limited';
    END IF;
  ELSIF NEW.is_guaranteed AND NEW.booked_pax >= NEW.min_pax THEN
    NEW.status := 'guaranteed';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_update_departure_status
  BEFORE UPDATE ON tour_departures
  FOR EACH ROW
  WHEN (OLD.booked_pax IS DISTINCT FROM NEW.booked_pax)
  EXECUTE FUNCTION update_departure_status();

-- ============================================
-- DEPARTURE BOOKINGS TABLE
-- Track individual bookings within a departure
-- ============================================

CREATE TABLE IF NOT EXISTS departure_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  departure_id UUID NOT NULL REFERENCES tour_departures(id) ON DELETE CASCADE,

  -- Customer
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  booking_name VARCHAR(255), -- For quick reference

  -- Pax count
  num_adults INTEGER NOT NULL DEFAULT 1,
  num_children INTEGER DEFAULT 0,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'no_show')),

  -- Pricing
  total_price DECIMAL(10,2),
  deposit_paid DECIMAL(10,2) DEFAULT 0,
  balance_due DECIMAL(10,2),

  -- Notes
  special_requests TEXT,
  internal_notes TEXT,

  -- Tracking
  booked_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_departure_bookings_tenant ON departure_bookings(tenant_id);
CREATE INDEX idx_departure_bookings_departure ON departure_bookings(departure_id);
CREATE INDEX idx_departure_bookings_client ON departure_bookings(client_id);
CREATE INDEX idx_departure_bookings_status ON departure_bookings(status);

ALTER TABLE departure_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tenant departure_bookings"
  ON departure_bookings FOR SELECT
  USING (tenant_id IN (SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()));

CREATE POLICY "Users can insert own tenant departure_bookings"
  ON departure_bookings FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()));

CREATE POLICY "Users can update own tenant departure_bookings"
  ON departure_bookings FOR UPDATE
  USING (tenant_id IN (SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()));

CREATE POLICY "Users can delete own tenant departure_bookings"
  ON departure_bookings FOR DELETE
  USING (tenant_id IN (SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()));

-- Function to update departure pax count when booking changes
CREATE OR REPLACE FUNCTION update_departure_pax_count()
RETURNS TRIGGER AS $$
DECLARE
  total_pax INTEGER;
BEGIN
  -- Calculate total pax for this departure
  SELECT COALESCE(SUM(num_adults + COALESCE(num_children, 0)), 0)
  INTO total_pax
  FROM departure_bookings
  WHERE departure_id = COALESCE(NEW.departure_id, OLD.departure_id)
    AND status IN ('pending', 'confirmed');

  -- Update the departure
  UPDATE tour_departures
  SET booked_pax = total_pax,
      updated_at = NOW()
  WHERE id = COALESCE(NEW.departure_id, OLD.departure_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_departure_count_on_booking
  AFTER INSERT OR UPDATE OR DELETE ON departure_bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_departure_pax_count();

-- Comments
COMMENT ON TABLE tour_departures IS 'Scheduled tour departures with capacity tracking for group tours';
COMMENT ON COLUMN tour_departures.status IS 'draft=not public, open=accepting bookings, limited=few spots left, full=no more bookings, guaranteed=will run, cancelled=not happening';
COMMENT ON COLUMN tour_departures.cutoff_days IS 'Stop accepting bookings N days before start_date';
COMMENT ON COLUMN tour_departures.is_guaranteed IS 'If true, tour will run regardless of number of bookings';

COMMENT ON TABLE departure_bookings IS 'Individual customer bookings within a tour departure';
