-- =====================================================================
-- Autoura: Create Bookings Module (Multi-Tenant)
-- Description: Bookings system that integrates with existing quotes & itineraries
-- Version: 1.0
-- Date: 2026-01-24
-- =====================================================================

-- =====================================================================
-- 1. BOOKINGS TABLE (Main)
-- =====================================================================

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Links to existing data
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE RESTRICT,
  quote_id UUID NOT NULL,  -- The accepted quote (b2c or b2b)
  quote_type VARCHAR(10) NOT NULL CHECK (quote_type IN ('b2c', 'b2b')),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  partner_id UUID REFERENCES b2b_partners(id) ON DELETE SET NULL,

  -- Booking identification
  booking_number VARCHAR(50) UNIQUE NOT NULL,
  booking_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Trip details (snapshot from quote/itinerary)
  trip_name VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days INTEGER NOT NULL,
  num_travelers INTEGER NOT NULL,

  -- Frozen pricing (snapshot from quote at booking time)
  total_amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  payment_terms TEXT,

  -- Payment tracking
  deposit_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  deposit_percent DECIMAL(5,2),
  total_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  balance_due DECIMAL(12,2) NOT NULL,

  -- Status (extends quote workflow)
  status VARCHAR(20) NOT NULL DEFAULT 'pending_deposit'
    CHECK (status IN (
      'pending_deposit',  -- Awaiting deposit payment
      'confirmed',        -- Deposit received, trip confirmed
      'paid_full',        -- Fully paid
      'in_progress',      -- Trip has started
      'completed',        -- Trip finished successfully
      'cancelled'         -- Booking cancelled
    )),

  -- Important dates
  confirmation_date DATE,
  payment_deadline DATE,
  full_payment_date DATE,
  cancellation_date DATE,

  -- Documents (links to generated PDFs)
  confirmation_pdf_url TEXT,
  voucher_urls JSONB,  -- Array of voucher URLs

  -- Special requests & notes
  special_requests TEXT,
  dietary_requirements TEXT,
  internal_notes TEXT,
  cancellation_reason TEXT,

  -- Metadata
  created_by UUID,
  confirmed_by UUID,
  cancelled_by UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_v2 ON bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status_v2 ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_dates_v2 ON bookings(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_bookings_client_v2 ON bookings(client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_partner_v2 ON bookings(partner_id);
CREATE INDEX IF NOT EXISTS idx_bookings_itinerary_v2 ON bookings(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_date_v2 ON bookings(booking_date DESC);

-- =====================================================================
-- 2. BOOKING PASSENGERS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS booking_passengers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,

  -- Personal details
  title VARCHAR(10),  -- Mr, Mrs, Ms, Dr
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  full_name VARCHAR(255) GENERATED ALWAYS AS (
    CASE
      WHEN title IS NOT NULL THEN title || ' ' || first_name || ' ' || last_name
      ELSE first_name || ' ' || last_name
    END
  ) STORED,
  date_of_birth DATE,
  gender VARCHAR(20),
  nationality VARCHAR(100),

  -- Contact information
  email VARCHAR(255),
  phone VARCHAR(50),
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(50),

  -- Travel documents
  passport_number VARCHAR(50),
  passport_expiry DATE,
  passport_issuing_country VARCHAR(100),
  visa_required BOOLEAN DEFAULT false,

  -- Passenger type
  passenger_type VARCHAR(20) NOT NULL DEFAULT 'adult'
    CHECK (passenger_type IN ('adult', 'child', 'infant', 'tour_leader')),
  is_lead_passenger BOOLEAN DEFAULT false,

  -- Room assignment
  room_type VARCHAR(50),  -- single, double, twin, triple
  roommate_id UUID REFERENCES booking_passengers(id) ON DELETE SET NULL,

  -- Special requirements
  meal_preference VARCHAR(50),  -- vegetarian, vegan, halal, kosher, gluten_free, etc.
  mobility_requirements TEXT,
  medical_conditions TEXT,
  special_requests TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_passengers_booking_v2 ON booking_passengers(booking_id);
CREATE INDEX IF NOT EXISTS idx_passengers_tenant_v2 ON booking_passengers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_passengers_lead_v2 ON booking_passengers(is_lead_passenger) WHERE is_lead_passenger = true;

-- =====================================================================
-- 3. BOOKING PAYMENTS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS booking_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,

  -- Payment identification
  payment_number VARCHAR(50) UNIQUE NOT NULL,

  -- Payment details
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',

  -- Payment type
  payment_type VARCHAR(20) NOT NULL DEFAULT 'deposit'
    CHECK (payment_type IN ('deposit', 'installment', 'balance', 'full_payment', 'refund', 'penalty')),

  -- Payment method
  payment_method VARCHAR(50),  -- bank_transfer, credit_card, cash, paypal, stripe, etc.

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'received', 'cleared', 'failed', 'refunded', 'cancelled')),

  -- Dates
  payment_date DATE,
  due_date DATE,
  cleared_date DATE,
  refund_date DATE,

  -- Reference & tracking
  transaction_reference VARCHAR(255),
  invoice_number VARCHAR(50),
  receipt_number VARCHAR(50),

  -- Bank/processor details
  bank_name VARCHAR(255),
  account_last4 VARCHAR(4),

  -- Notes
  notes TEXT,

  -- Metadata
  created_by UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_booking_payments_booking_v2 ON booking_payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_payments_tenant_v2 ON booking_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_booking_payments_status_v2 ON booking_payments(status);
CREATE INDEX IF NOT EXISTS idx_booking_payments_date_v2 ON booking_payments(payment_date DESC);

-- =====================================================================
-- 4. BOOKING NUMBER SEQUENCE
-- =====================================================================

CREATE SEQUENCE IF NOT EXISTS booking_seq START 1;
CREATE SEQUENCE IF NOT EXISTS payment_seq START 1;

-- Function to generate booking numbers
CREATE OR REPLACE FUNCTION generate_booking_number()
RETURNS VARCHAR(50) AS $$
DECLARE
  v_year VARCHAR(4);
  v_seq INTEGER;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::VARCHAR;
  v_seq := nextval('booking_seq');
  RETURN 'BK-' || v_year || '-' || LPAD(v_seq::VARCHAR, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to generate payment numbers
CREATE OR REPLACE FUNCTION generate_payment_number()
RETURNS VARCHAR(50) AS $$
DECLARE
  v_year VARCHAR(4);
  v_seq INTEGER;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::VARCHAR;
  v_seq := nextval('payment_seq');
  RETURN 'PAY-' || v_year || '-' || LPAD(v_seq::VARCHAR, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 5. TRIGGERS
-- =====================================================================

-- Updated_at triggers
DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_booking_passengers_updated_at ON booking_passengers;
CREATE TRIGGER update_booking_passengers_updated_at
  BEFORE UPDATE ON booking_passengers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_booking_payments_updated_at ON booking_payments;
CREATE TRIGGER update_booking_payments_updated_at
  BEFORE UPDATE ON booking_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-calculate balance due
CREATE OR REPLACE FUNCTION calculate_booking_balance()
RETURNS TRIGGER AS $$
BEGIN
  NEW.balance_due := NEW.total_amount - NEW.total_paid;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_balance_trigger ON bookings;
CREATE TRIGGER calculate_balance_trigger
  BEFORE INSERT OR UPDATE OF total_amount, total_paid ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION calculate_booking_balance();

-- =====================================================================
-- 6. ROW LEVEL SECURITY
-- =====================================================================

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own tenant bookings" ON bookings;
DROP POLICY IF EXISTS "Users can insert own tenant bookings" ON bookings;
DROP POLICY IF EXISTS "Managers can update own tenant bookings" ON bookings;
DROP POLICY IF EXISTS "Managers can delete own tenant bookings" ON bookings;

DROP POLICY IF EXISTS "Users can view own tenant passengers" ON booking_passengers;
DROP POLICY IF EXISTS "Users can insert own tenant passengers" ON booking_passengers;
DROP POLICY IF EXISTS "Users can update own tenant passengers" ON booking_passengers;
DROP POLICY IF EXISTS "Managers can delete own tenant passengers" ON booking_passengers;

DROP POLICY IF EXISTS "Users can view own tenant payments" ON booking_payments;
DROP POLICY IF EXISTS "Managers can insert own tenant payments" ON booking_payments;
DROP POLICY IF EXISTS "Managers can update own tenant payments" ON booking_payments;

-- Bookings policies
CREATE POLICY "Users can view own tenant bookings"
  ON bookings FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can insert own tenant bookings"
  ON bookings FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "Managers can update own tenant bookings"
  ON bookings FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND user_has_role('manager'));

CREATE POLICY "Managers can delete own tenant bookings"
  ON bookings FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND user_has_role('manager'));

-- Passengers policies
CREATE POLICY "Users can view own tenant passengers"
  ON booking_passengers FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can insert own tenant passengers"
  ON booking_passengers FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can update own tenant passengers"
  ON booking_passengers FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Managers can delete own tenant passengers"
  ON booking_passengers FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND user_has_role('manager'));

-- Payments policies
CREATE POLICY "Users can view own tenant payments"
  ON booking_payments FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Managers can insert own tenant payments"
  ON booking_payments FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND user_has_role('manager'));

CREATE POLICY "Managers can update own tenant payments"
  ON booking_payments FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND user_has_role('manager'));

-- =====================================================================
-- 7. COMMENTS
-- =====================================================================

COMMENT ON TABLE bookings IS 'Confirmed trips from accepted quotes';
COMMENT ON TABLE booking_passengers IS 'Individual traveler details for each booking';
COMMENT ON TABLE booking_payments IS 'Payment history and tracking for bookings';

COMMENT ON COLUMN bookings.status IS 'Booking lifecycle: pending_deposit → confirmed → paid_full → in_progress → completed';
COMMENT ON COLUMN bookings.quote_type IS 'Either b2c (from b2c_quotes) or b2b (from b2b_quotes)';
COMMENT ON COLUMN bookings.balance_due IS 'Auto-calculated: total_amount - total_paid';

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================
-- Tables created:
--   - bookings (main booking records)
--   - booking_passengers (traveler details)
--   - booking_payments (payment history)
-- Features:
--   - Links to existing quotes & itineraries
--   - Automatic booking number generation (BK-2026-0001)
--   - Payment tracking with auto balance calculation
--   - Multi-tenant with RLS enabled
-- =====================================================================
