-- ============================================
-- Migration 201: Create booking_supplier_status table
-- Tracks supplier confirmations per booking
-- ============================================

CREATE TABLE IF NOT EXISTS booking_supplier_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  supplier_id UUID,
  supplier_type VARCHAR(50) NOT NULL,
  supplier_name VARCHAR(255) NOT NULL,
  service_description TEXT,
  service_date DATE,
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  quoted_cost DECIMAL(12,2),
  confirmed_cost DECIMAL(12,2),
  confirmation_number VARCHAR(100),
  confirmation_notes TEXT,
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'confirmed', 'cancelled', 'no_response')),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_supplier_status_booking ON booking_supplier_status(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_supplier_status_tenant ON booking_supplier_status(tenant_id);
CREATE INDEX IF NOT EXISTS idx_booking_supplier_status_status ON booking_supplier_status(status);

-- RLS
ALTER TABLE booking_supplier_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_supplier_status_tenant_isolation" ON booking_supplier_status
  FOR ALL USING (tenant_id = get_user_tenant_id());
