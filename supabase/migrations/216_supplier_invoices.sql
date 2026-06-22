-- =====================================================================
-- Migration 216: Supplier Invoices (Accounts Payable)
-- Description: Records supplier-side invoices for a three-way match
--              (supplier invoice -> expense -> payment). Tenant-scoped
--              (the sibling is single-tenant). Distinct from `invoices`
--              (client/AR) and `expenses` (cost accrual) — no collision.
-- Date: 2026-06-23
-- =====================================================================

-- Per-tenant-ish sequence backing the human reference SI-YYYY-NNNN.
CREATE SEQUENCE IF NOT EXISTS supplier_invoice_number_seq START 1;

-- Reference generator (SECURITY DEFINER so it can read the sequence under RLS).
CREATE OR REPLACE FUNCTION next_supplier_invoice_reference()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'SI-' || to_char(NOW(), 'YYYY') || '-' || lpad(nextval('supplier_invoice_number_seq')::text, 4, '0')
$$;
GRANT EXECUTE ON FUNCTION next_supplier_invoice_reference() TO authenticated, service_role;

-- =====================================================================
-- TABLE: supplier_invoices
-- =====================================================================
CREATE TABLE IF NOT EXISTS supplier_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  supplier_invoice_number TEXT NOT NULL,     -- number on the supplier's invoice
  internal_reference TEXT,                    -- auto SI-YYYY-NNNN
  supplier_name TEXT NOT NULL,
  supplier_id UUID,                           -- optional link to suppliers
  invoice_date DATE NOT NULL,
  due_date DATE,
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  tax_amount DECIMAL(12,2) DEFAULT 0,
  description TEXT,
  line_items JSONB,

  status TEXT DEFAULT 'received' CHECK (status IN ('received', 'matched', 'approved', 'paid', 'disputed', 'cancelled')),
  match_status TEXT DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'partial', 'matched', 'discrepancy')),
  matched_amount DECIMAL(12,2) DEFAULT 0,
  discrepancy_amount DECIMAL(12,2) DEFAULT 0,
  discrepancy_notes TEXT,

  document_url TEXT,
  document_filename TEXT,
  document_storage_path TEXT,

  approved_by UUID,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  payment_method TEXT,
  payment_reference TEXT,
  notes TEXT,
  itinerary_id UUID,
  client_invoice_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_tenant ON supplier_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_status ON supplier_invoices(status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_match_status ON supplier_invoices(match_status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier ON supplier_invoices(supplier_name);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_date ON supplier_invoices(invoice_date);

-- =====================================================================
-- JUNCTION: supplier_invoice_expenses (many-to-many: invoice <-> expense)
-- =====================================================================
CREATE TABLE IF NOT EXISTS supplier_invoice_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_invoice_id UUID NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  matched_amount DECIMAL(12,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supplier_invoice_id, expense_id)
);

CREATE INDEX IF NOT EXISTS idx_sie_tenant ON supplier_invoice_expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sie_supplier_invoice ON supplier_invoice_expenses(supplier_invoice_id);
CREATE INDEX IF NOT EXISTS idx_sie_expense ON supplier_invoice_expenses(expense_id);

-- =====================================================================
-- ROW LEVEL SECURITY (tenant isolation + service-role)
-- =====================================================================
ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoice_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_invoices_tenant ON supplier_invoices
  FOR ALL USING (tenant_id = get_user_tenant_id()) WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY supplier_invoices_service_role ON supplier_invoices
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY sie_tenant ON supplier_invoice_expenses
  FOR ALL USING (tenant_id = get_user_tenant_id()) WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY sie_service_role ON supplier_invoice_expenses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- updated_at trigger
-- =====================================================================
CREATE OR REPLACE FUNCTION update_supplier_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_supplier_invoices_updated_at ON supplier_invoices;
CREATE TRIGGER trigger_supplier_invoices_updated_at
  BEFORE UPDATE ON supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION update_supplier_invoices_updated_at();
