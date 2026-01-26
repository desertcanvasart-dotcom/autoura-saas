-- =====================================================================
-- Autoura Financial Module: Multi-Tenant Financial Tables
-- Description: Creates payments, invoices, expenses, and invoice_payments
--              with tenant isolation built-in from the start
-- Version: 1.0
-- Date: 2026-01-23
-- Security: Row Level Security enabled by default
-- =====================================================================

-- =====================================================================
-- 1. PAYMENTS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Relations
  itinerary_id UUID REFERENCES itineraries(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- Payment details
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  payment_method VARCHAR(50) NOT NULL
    CHECK (payment_method IN ('bank_transfer', 'cash', 'credit_card', 'paypal', 'stripe', 'other')),
  payment_date DATE NOT NULL,

  -- Reference
  transaction_reference VARCHAR(255),

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),

  -- Notes
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_itinerary ON payments(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_date ON payments(tenant_id, payment_date DESC);

-- Updated_at trigger for payments
DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DO $$
BEGIN
  RAISE NOTICE '✅ Created: payments table with tenant_id';
END $$;

-- =====================================================================
-- 2. INVOICES TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Invoice identification
  invoice_number VARCHAR(50) NOT NULL,
  invoice_type VARCHAR(20) NOT NULL DEFAULT 'standard'
    CHECK (invoice_type IN ('standard', 'deposit', 'final')),

  -- Deposit/Final invoice tracking
  deposit_percent DECIMAL(5,2) DEFAULT 10,
  parent_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,

  -- Relations
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  itinerary_id UUID REFERENCES itineraries(id) ON DELETE SET NULL,

  -- Client info (denormalized for PDF generation)
  client_name VARCHAR(255) NOT NULL,
  client_email VARCHAR(255),

  -- Invoice items (JSONB array)
  line_items JSONB NOT NULL DEFAULT '[]',
  /*
  Example structure:
  [
    {
      "description": "7-day Classic Egypt Tour",
      "quantity": 2,
      "unit_price": 1250.00,
      "amount": 2500.00
    }
  ]
  */

  -- Amounts
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',

  -- Payment tracking
  amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  balance_due DECIMAL(12,2) NOT NULL,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'cancelled')),

  -- Dates
  issue_date DATE NOT NULL,
  due_date DATE,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  -- Terms
  payment_terms TEXT,
  payment_instructions TEXT,

  -- Notes
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique invoice number per tenant
  UNIQUE(tenant_id, invoice_number)
);

-- Indexes for invoices
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_itinerary ON invoices(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices(issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status ON invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_date ON invoices(tenant_id, issue_date DESC);

-- Updated_at trigger for invoices
DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DO $$
BEGIN
  RAISE NOTICE '✅ Created: invoices table with tenant_id';
END $$;

-- =====================================================================
-- 3. INVOICE PAYMENTS TABLE (Junction with payment tracking)
-- =====================================================================

CREATE TABLE IF NOT EXISTS invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Relations
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

  -- Payment details
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  payment_method VARCHAR(50) NOT NULL DEFAULT 'bank_transfer'
    CHECK (payment_method IN ('bank_transfer', 'cash', 'credit_card', 'paypal', 'stripe', 'other')),
  payment_date DATE NOT NULL,

  -- Reference
  transaction_reference VARCHAR(255),

  -- Notes
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for invoice_payments
CREATE INDEX IF NOT EXISTS idx_invoice_payments_tenant ON invoice_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_tenant_invoice ON invoice_payments(tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_date ON invoice_payments(payment_date DESC);

DO $$
BEGIN
  RAISE NOTICE '✅ Created: invoice_payments table with tenant_id';
END $$;

-- =====================================================================
-- 4. EXPENSES TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Expense identification
  expense_number VARCHAR(50) NOT NULL,

  -- Relations
  itinerary_id UUID REFERENCES itineraries(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,

  -- Expense details
  category VARCHAR(50) NOT NULL
    CHECK (category IN ('accommodation', 'transportation', 'guide', 'meals', 'entrance_fees', 'tips', 'flights', 'cruise', 'other')),
  description TEXT,

  -- Amount
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  expense_date DATE NOT NULL,

  -- Supplier info (denormalized)
  supplier_name VARCHAR(255),
  supplier_type VARCHAR(50),

  -- Receipt
  receipt_url TEXT,
  receipt_filename VARCHAR(255),

  -- Payment status
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
  payment_method VARCHAR(50),
  payment_date DATE,
  payment_reference VARCHAR(255),

  -- Notes
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique expense number per tenant
  UNIQUE(tenant_id, expense_number)
);

-- Indexes for expenses
CREATE INDEX IF NOT EXISTS idx_expenses_tenant ON expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_number ON expenses(expense_number);
CREATE INDEX IF NOT EXISTS idx_expenses_itinerary ON expenses(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_expenses_supplier ON expenses(supplier_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date ON expenses(tenant_id, expense_date DESC);

-- Updated_at trigger for expenses
DROP TRIGGER IF EXISTS update_expenses_updated_at ON expenses;
CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DO $$
BEGIN
  RAISE NOTICE '✅ Created: expenses table with tenant_id';
END $$;

-- =====================================================================
-- 5. SEQUENCE FOR NUMBER GENERATION
-- =====================================================================

CREATE SEQUENCE IF NOT EXISTS expense_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

DO $$
BEGIN
  RAISE NOTICE '✅ Created: Number sequences';
END $$;

-- =====================================================================
-- 6. AUTO-POPULATE TENANT_ID TRIGGERS
-- =====================================================================

-- Trigger to auto-populate tenant_id on invoice_payments from invoice
CREATE OR REPLACE FUNCTION auto_populate_invoice_payment_tenant()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := (
      SELECT tenant_id
      FROM invoices
      WHERE id = NEW.invoice_id
      LIMIT 1
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_populate_invoice_payment_tenant_trigger ON invoice_payments;
CREATE TRIGGER auto_populate_invoice_payment_tenant_trigger
  BEFORE INSERT ON invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION auto_populate_invoice_payment_tenant();

DO $$
BEGIN
  RAISE NOTICE '✅ Created: Auto-populate triggers';
END $$;

-- =====================================================================
-- 7. TRIGGER TO UPDATE INVOICE BALANCE ON PAYMENT
-- =====================================================================

CREATE OR REPLACE FUNCTION update_invoice_on_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_total_paid DECIMAL(12,2);
  v_invoice_total DECIMAL(12,2);
  v_new_balance DECIMAL(12,2);
  v_new_status VARCHAR(20);
BEGIN
  -- Calculate total paid for this invoice
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_paid
  FROM invoice_payments
  WHERE invoice_id = NEW.invoice_id;

  -- Get invoice total
  SELECT total_amount
  INTO v_invoice_total
  FROM invoices
  WHERE id = NEW.invoice_id;

  -- Calculate new balance
  v_new_balance := v_invoice_total - v_total_paid;

  -- Determine new status
  IF v_new_balance <= 0 THEN
    v_new_status := 'paid';
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'partially_paid';
  ELSE
    v_new_status := 'sent';
  END IF;

  -- Update invoice
  UPDATE invoices
  SET
    amount_paid = v_total_paid,
    balance_due = v_new_balance,
    status = v_new_status,
    paid_at = CASE WHEN v_new_balance <= 0 THEN NOW() ELSE paid_at END,
    updated_at = NOW()
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_invoice_on_payment_trigger ON invoice_payments;
CREATE TRIGGER update_invoice_on_payment_trigger
  AFTER INSERT ON invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_on_payment();

DO $$
BEGIN
  RAISE NOTICE '✅ Created: Invoice balance update trigger';
END $$;

-- =====================================================================
-- 8. ROW LEVEL SECURITY POLICIES
-- =====================================================================

-- Enable RLS on all financial tables
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  RAISE NOTICE '✅ Enabled: RLS on all financial tables';
END $$;

-- =====================================================================
-- RLS POLICIES: PAYMENTS
-- =====================================================================

-- Users can view their tenant's payments
DROP POLICY IF EXISTS "Users can view own tenant payments" ON payments;
CREATE POLICY "Users can view own tenant payments"
  ON payments FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Users can create payments in their tenant
DROP POLICY IF EXISTS "Users can insert own tenant payments" ON payments;
CREATE POLICY "Users can insert own tenant payments"
  ON payments FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Users can update their tenant's payments
DROP POLICY IF EXISTS "Users can update own tenant payments" ON payments;
CREATE POLICY "Users can update own tenant payments"
  ON payments FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

-- Managers+ can delete payments
DROP POLICY IF EXISTS "Managers can delete payments" ON payments;
CREATE POLICY "Managers can delete payments"
  ON payments FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND user_has_role('manager'));

DO $$
BEGIN
  RAISE NOTICE '✅ Created: RLS policies for payments';
END $$;

-- =====================================================================
-- RLS POLICIES: INVOICES
-- =====================================================================

-- Users can view their tenant's invoices
DROP POLICY IF EXISTS "Users can view own tenant invoices" ON invoices;
CREATE POLICY "Users can view own tenant invoices"
  ON invoices FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Users can create invoices in their tenant
DROP POLICY IF EXISTS "Users can insert own tenant invoices" ON invoices;
CREATE POLICY "Users can insert own tenant invoices"
  ON invoices FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Users can update their tenant's invoices
DROP POLICY IF EXISTS "Users can update own tenant invoices" ON invoices;
CREATE POLICY "Users can update own tenant invoices"
  ON invoices FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

-- Managers+ can delete invoices
DROP POLICY IF EXISTS "Managers can delete invoices" ON invoices;
CREATE POLICY "Managers can delete invoices"
  ON invoices FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND user_has_role('manager'));

DO $$
BEGIN
  RAISE NOTICE '✅ Created: RLS policies for invoices';
END $$;

-- =====================================================================
-- RLS POLICIES: INVOICE PAYMENTS
-- =====================================================================

-- Users can view their tenant's invoice payments
DROP POLICY IF EXISTS "Users can view own tenant invoice payments" ON invoice_payments;
CREATE POLICY "Users can view own tenant invoice payments"
  ON invoice_payments FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Users can create invoice payments in their tenant
DROP POLICY IF EXISTS "Users can insert own tenant invoice payments" ON invoice_payments;
CREATE POLICY "Users can insert own tenant invoice payments"
  ON invoice_payments FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Users can update their tenant's invoice payments
DROP POLICY IF EXISTS "Users can update own tenant invoice payments" ON invoice_payments;
CREATE POLICY "Users can update own tenant invoice payments"
  ON invoice_payments FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

-- Managers+ can delete invoice payments
DROP POLICY IF EXISTS "Managers can delete invoice payments" ON invoice_payments;
CREATE POLICY "Managers can delete invoice payments"
  ON invoice_payments FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND user_has_role('manager'));

DO $$
BEGIN
  RAISE NOTICE '✅ Created: RLS policies for invoice_payments';
END $$;

-- =====================================================================
-- RLS POLICIES: EXPENSES
-- =====================================================================

-- Users can view their tenant's expenses
DROP POLICY IF EXISTS "Users can view own tenant expenses" ON expenses;
CREATE POLICY "Users can view own tenant expenses"
  ON expenses FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Users can create expenses in their tenant
DROP POLICY IF EXISTS "Users can insert own tenant expenses" ON expenses;
CREATE POLICY "Users can insert own tenant expenses"
  ON expenses FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Users can update their tenant's expenses
DROP POLICY IF EXISTS "Users can update own tenant expenses" ON expenses;
CREATE POLICY "Users can update own tenant expenses"
  ON expenses FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

-- Managers+ can delete expenses
DROP POLICY IF EXISTS "Managers can delete expenses" ON expenses;
CREATE POLICY "Managers can delete expenses"
  ON expenses FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND user_has_role('manager'));

DO $$
BEGIN
  RAISE NOTICE '✅ Created: RLS policies for expenses';
END $$;

-- =====================================================================
-- 9. VERIFICATION QUERIES
-- =====================================================================

-- To run after migration:
/*

-- Check table structures
\d+ payments
\d+ invoices
\d+ invoice_payments
\d+ expenses

-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('payments', 'invoices', 'invoice_payments', 'expenses');

-- Check policies
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('payments', 'invoices', 'invoice_payments', 'expenses')
ORDER BY tablename, policyname;

-- Test tenant_id population
-- (Make sure you're authenticated as a user with a tenant membership)
SELECT
  'payments' as table_name, COUNT(*) as count, COUNT(tenant_id) as with_tenant
FROM payments
UNION ALL
SELECT 'invoices', COUNT(*), COUNT(tenant_id) FROM invoices
UNION ALL
SELECT 'invoice_payments', COUNT(*), COUNT(tenant_id) FROM invoice_payments
UNION ALL
SELECT 'expenses', COUNT(*), COUNT(tenant_id) FROM expenses;

*/

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Financial Module Migration Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Created Tables:';
  RAISE NOTICE '  ✅ payments (with tenant_id)';
  RAISE NOTICE '  ✅ invoices (with tenant_id)';
  RAISE NOTICE '  ✅ invoice_payments (with tenant_id)';
  RAISE NOTICE '  ✅ expenses (with tenant_id)';
  RAISE NOTICE '';
  RAISE NOTICE 'Security Features:';
  RAISE NOTICE '  ✅ RLS enabled on all tables';
  RAISE NOTICE '  ✅ 4 RLS policies per table (SELECT, INSERT, UPDATE, DELETE)';
  RAISE NOTICE '  ✅ Auto-populate tenant_id triggers';
  RAISE NOTICE '  ✅ Invoice balance update trigger';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '  1. Run verification queries';
  RAISE NOTICE '  2. Update API endpoints to use createAuthenticatedClient()';
  RAISE NOTICE '  3. Test financial operations';
  RAISE NOTICE '  4. Remove admin client usage from APIs';
  RAISE NOTICE '';
END $$;
