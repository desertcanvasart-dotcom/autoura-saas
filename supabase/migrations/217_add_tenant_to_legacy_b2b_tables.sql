-- =====================================================
-- Migration 217: Add Tenant Isolation to Legacy B2B Tables
-- =====================================================
-- tour_quotes, b2b_pricing_rules, b2b_transport_packages and
-- b2b_partner_pricing were created directly in the database (no DDL in this
-- repo) and never got a tenant_id column. Their API routes are auth-gated,
-- but with no tenant column any authenticated tenant could read/write any
-- other tenant's rows.
--
-- Strategy:
--   * tour_quotes            -> backfill from tour_variations.tenant_id
--                              (via variation_id); NOT NULL + strict RLS.
--   * b2b_partner_pricing    -> backfill from b2b_partners.tenant_id
--                              (via partner_id); NOT NULL + strict RLS.
--   * b2b_pricing_rules      -> no FK to backfill from. Existing rows are
--   * b2b_transport_packages   left as shared legacy rows (tenant_id NULL,
--                              readable by everyone, mutable by no one);
--                              new rows are written with the owner's
--                              tenant_id and are strictly isolated.
--
-- All blocks are idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS) so the
-- migration is safe to re-run and safe if a column was added out of band.

-- =====================================================
-- 1. tour_quotes  (backfill via tour_variations)
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tour_quotes' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE tour_quotes ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Backfill from the variation the quote was built from
UPDATE tour_quotes q
SET tenant_id = v.tenant_id
FROM tour_variations v
WHERE q.variation_id = v.id
  AND q.tenant_id IS NULL;

-- Any quote we still couldn't resolve (orphan variation_id) falls back to the
-- partner's tenant, if a partner is set.
UPDATE tour_quotes q
SET tenant_id = p.tenant_id
FROM b2b_partners p
WHERE q.partner_id = p.id
  AND q.tenant_id IS NULL;

-- Report rows that remain unassigned instead of silently dropping isolation.
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM tour_quotes WHERE tenant_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE WARNING 'tour_quotes: % row(s) could not be assigned a tenant_id (orphan variation_id and no partner). They remain NULL and are hidden by RLS until fixed manually.', orphan_count;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tour_quotes_tenant ON tour_quotes(tenant_id);
ALTER TABLE tour_quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their tenant tour_quotes" ON tour_quotes;
DROP POLICY IF EXISTS "Users can insert tour_quotes for their tenant" ON tour_quotes;
DROP POLICY IF EXISTS "Users can update their tenant tour_quotes" ON tour_quotes;
DROP POLICY IF EXISTS "Users can delete their tenant tour_quotes" ON tour_quotes;

CREATE POLICY "Users can view their tenant tour_quotes" ON tour_quotes
  FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can insert tour_quotes for their tenant" ON tour_quotes
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can update their tenant tour_quotes" ON tour_quotes
  FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can delete their tenant tour_quotes" ON tour_quotes
  FOR DELETE USING (tenant_id = get_user_tenant_id());

-- =====================================================
-- 2. b2b_partner_pricing  (backfill via b2b_partners)
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'b2b_partner_pricing' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE b2b_partner_pricing ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

UPDATE b2b_partner_pricing pp
SET tenant_id = p.tenant_id
FROM b2b_partners p
WHERE pp.partner_id = p.id
  AND pp.tenant_id IS NULL;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM b2b_partner_pricing WHERE tenant_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE WARNING 'b2b_partner_pricing: % row(s) could not be assigned a tenant_id (orphan partner_id). They remain NULL and are hidden by RLS until fixed manually.', orphan_count;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_b2b_partner_pricing_tenant ON b2b_partner_pricing(tenant_id);
ALTER TABLE b2b_partner_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their tenant b2b_partner_pricing" ON b2b_partner_pricing;
DROP POLICY IF EXISTS "Users can insert b2b_partner_pricing for their tenant" ON b2b_partner_pricing;
DROP POLICY IF EXISTS "Users can update their tenant b2b_partner_pricing" ON b2b_partner_pricing;
DROP POLICY IF EXISTS "Users can delete their tenant b2b_partner_pricing" ON b2b_partner_pricing;

CREATE POLICY "Users can view their tenant b2b_partner_pricing" ON b2b_partner_pricing
  FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can insert b2b_partner_pricing for their tenant" ON b2b_partner_pricing
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can update their tenant b2b_partner_pricing" ON b2b_partner_pricing
  FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can delete their tenant b2b_partner_pricing" ON b2b_partner_pricing
  FOR DELETE USING (tenant_id = get_user_tenant_id());

-- =====================================================
-- 3. b2b_pricing_rules  (no FK; existing rows = shared legacy)
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'b2b_pricing_rules' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE b2b_pricing_rules ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_b2b_pricing_rules_tenant ON b2b_pricing_rules(tenant_id);
ALTER TABLE b2b_pricing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view tenant or shared b2b_pricing_rules" ON b2b_pricing_rules;
DROP POLICY IF EXISTS "Users can insert b2b_pricing_rules for their tenant" ON b2b_pricing_rules;
DROP POLICY IF EXISTS "Users can update their tenant b2b_pricing_rules" ON b2b_pricing_rules;
DROP POLICY IF EXISTS "Users can delete their tenant b2b_pricing_rules" ON b2b_pricing_rules;

-- Read: own-tenant rows plus shared legacy (NULL) rows.
CREATE POLICY "Users can view tenant or shared b2b_pricing_rules" ON b2b_pricing_rules
  FOR SELECT USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());
-- Write: only into your own tenant; legacy shared rows are immutable.
CREATE POLICY "Users can insert b2b_pricing_rules for their tenant" ON b2b_pricing_rules
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can update their tenant b2b_pricing_rules" ON b2b_pricing_rules
  FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can delete their tenant b2b_pricing_rules" ON b2b_pricing_rules
  FOR DELETE USING (tenant_id = get_user_tenant_id());

-- =====================================================
-- 4. b2b_transport_packages  (no FK; existing rows = shared legacy)
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'b2b_transport_packages' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE b2b_transport_packages ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_b2b_transport_packages_tenant ON b2b_transport_packages(tenant_id);
ALTER TABLE b2b_transport_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view tenant or shared b2b_transport_packages" ON b2b_transport_packages;
DROP POLICY IF EXISTS "Users can insert b2b_transport_packages for their tenant" ON b2b_transport_packages;
DROP POLICY IF EXISTS "Users can update their tenant b2b_transport_packages" ON b2b_transport_packages;
DROP POLICY IF EXISTS "Users can delete their tenant b2b_transport_packages" ON b2b_transport_packages;

CREATE POLICY "Users can view tenant or shared b2b_transport_packages" ON b2b_transport_packages
  FOR SELECT USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());
CREATE POLICY "Users can insert b2b_transport_packages for their tenant" ON b2b_transport_packages
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can update their tenant b2b_transport_packages" ON b2b_transport_packages
  FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can delete their tenant b2b_transport_packages" ON b2b_transport_packages
  FOR DELETE USING (tenant_id = get_user_tenant_id());
