-- =====================================================================
-- Migration 034: Create supplier_documents Table with Multi-Tenancy
-- Date: 2026-01-23
-- Description: Creates supplier documents table for vouchers and service orders
-- =====================================================================

CREATE TABLE IF NOT EXISTS supplier_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Document identification
  document_type VARCHAR(50) NOT NULL
    CHECK (document_type IN (
      'hotel_voucher',
      'service_order',
      'transport_voucher',
      'activity_voucher',
      'guide_assignment',
      'cruise_voucher'
    )),
  document_number VARCHAR(50) NOT NULL UNIQUE,

  -- References
  itinerary_id UUID REFERENCES itineraries(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,

  -- Supplier details
  supplier_name VARCHAR(255) NOT NULL,
  supplier_contact_name VARCHAR(255),
  supplier_contact_email VARCHAR(255),
  supplier_contact_phone VARCHAR(100),
  supplier_address TEXT,

  -- Client details
  client_name VARCHAR(255) NOT NULL,
  client_nationality VARCHAR(100),
  num_adults INTEGER NOT NULL DEFAULT 1,
  num_children INTEGER NOT NULL DEFAULT 0,

  -- Service details
  city VARCHAR(255),
  service_date DATE,
  check_in DATE,
  check_out DATE,
  pickup_time TIME,
  pickup_location VARCHAR(255),
  dropoff_location VARCHAR(255),

  -- Services JSONB array
  services JSONB DEFAULT '[]'::jsonb,

  -- Financial
  currency VARCHAR(3) DEFAULT 'EUR',
  total_cost DECIMAL(12,2) DEFAULT 0,

  -- Terms and notes
  payment_terms TEXT,
  special_requests TEXT,
  internal_notes TEXT,

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'confirmed', 'completed', 'cancelled')),
  sent_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- INDEXES
-- =====================================================================

CREATE INDEX idx_supplier_documents_tenant ON supplier_documents(tenant_id);
CREATE INDEX idx_supplier_documents_itinerary ON supplier_documents(itinerary_id);
CREATE INDEX idx_supplier_documents_supplier ON supplier_documents(supplier_id);
CREATE INDEX idx_supplier_documents_type ON supplier_documents(document_type);
CREATE INDEX idx_supplier_documents_status ON supplier_documents(status);
CREATE INDEX idx_supplier_documents_service_date ON supplier_documents(service_date);
CREATE INDEX idx_supplier_documents_number ON supplier_documents(document_number);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================

ALTER TABLE supplier_documents ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can view their tenant's supplier documents
CREATE POLICY "Users can view their tenant's supplier documents"
  ON supplier_documents FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- INSERT: Users can create supplier documents for their tenant
CREATE POLICY "Users can create supplier documents for their tenant"
  ON supplier_documents FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- UPDATE: Users can update their tenant's supplier documents
CREATE POLICY "Users can update their tenant's supplier documents"
  ON supplier_documents FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

-- DELETE: Managers can delete their tenant's supplier documents
CREATE POLICY "Managers can delete their tenant's supplier documents"
  ON supplier_documents FOR DELETE
  USING (
    tenant_id = get_user_tenant_id()
    AND user_has_role('manager')
  );

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- Auto-update timestamp trigger
CREATE TRIGGER update_supplier_documents_updated_at
  BEFORE UPDATE ON supplier_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- COMMENTS
-- =====================================================================

COMMENT ON TABLE supplier_documents IS 'Hotel vouchers, service orders, transport vouchers, and other supplier communications';
COMMENT ON COLUMN supplier_documents.tenant_id IS 'Tenant isolation - required for multi-tenancy';
COMMENT ON COLUMN supplier_documents.document_type IS 'Type of document: hotel_voucher, service_order, transport_voucher, activity_voucher, guide_assignment, cruise_voucher';
COMMENT ON COLUMN supplier_documents.services IS 'JSONB array of service line items with descriptions, quantities, and amounts';
COMMENT ON COLUMN supplier_documents.status IS 'Document lifecycle: draft, sent, confirmed, completed, cancelled';

-- =====================================================================
-- SUMMARY
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '====================================';
  RAISE NOTICE 'Migration 034 Complete';
  RAISE NOTICE '====================================';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Created: supplier_documents table';
  RAISE NOTICE '✅ Added: tenant_id column with FK constraint';
  RAISE NOTICE '✅ Created: 7 performance indexes';
  RAISE NOTICE '✅ Enabled: Row Level Security (RLS)';
  RAISE NOTICE '✅ Created: 4 RLS policies';
  RAISE NOTICE '✅ Added: Auto-update timestamp trigger';
  RAISE NOTICE '';
  RAISE NOTICE 'Table supports:';
  RAISE NOTICE '  • Hotel vouchers';
  RAISE NOTICE '  • Service orders';
  RAISE NOTICE '  • Transport vouchers';
  RAISE NOTICE '  • Activity vouchers';
  RAISE NOTICE '  • Guide assignments';
  RAISE NOTICE '  • Cruise vouchers';
  RAISE NOTICE '';
  RAISE NOTICE 'Security features:';
  RAISE NOTICE '  • Tenant isolation via tenant_id';
  RAISE NOTICE '  • RLS policies filter by tenant automatically';
  RAISE NOTICE '  • Manager role required for deletion';
  RAISE NOTICE '';
END $$;
