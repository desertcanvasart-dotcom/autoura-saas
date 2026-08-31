-- ============================================================================
-- 311 — supplier_properties: the assets a supplier operates
-- ============================================================================
-- Port of travel-ops-pro's Phase 1 (operator, 2026-08-31): "a train company
-- has several trains; cruises and hotels are the same — in the supplier
-- section we need to add those properties." Supplier HAS properties: the ship
-- or hotel as a sub-entity with its own contact, picked by rate forms.
--
-- THIS APP STILL RAN THE OLD MODEL the parent retired on 2026-08-22: a
-- supplier could BE a property (is_property + parent_supplier_id,
-- self-referencing), with a Properties tab listing child suppliers. Live
-- usage: one orphaned is_property flag, zero parent links, zero ship_names
-- (verified 2026-08-31). The old columns are dropped at the bottom so the two
-- models can never coexist.
--
-- Phase 1 links nile_cruises only; hotels and trains follow in later phases.

BEGIN;

CREATE TABLE IF NOT EXISTS supplier_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,

  property_type TEXT NOT NULL CHECK (property_type IN ('ship', 'hotel', 'train')),
  name TEXT NOT NULL,
  city TEXT,
  category TEXT,

  -- The property's OWN contact (the ship's operations desk) — distinct from
  -- the supplier's company contact.
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,

  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT supplier_properties_unique_name UNIQUE (supplier_id, property_type, name)
);

CREATE INDEX IF NOT EXISTS idx_supplier_properties_supplier
  ON supplier_properties (supplier_id, property_type);
CREATE INDEX IF NOT EXISTS idx_supplier_properties_tenant
  ON supplier_properties (tenant_id);

-- Tenant isolation, same shape as 304: authenticated sees its tenant, the
-- service role passes (routes that already hold a tenant-scoped client).
ALTER TABLE supplier_properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_properties_tenant ON supplier_properties;
CREATE POLICY supplier_properties_tenant ON supplier_properties
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS supplier_properties_service ON supplier_properties;
CREATE POLICY supplier_properties_service ON supplier_properties
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- The cruise rate references its ship. ship_name STAYS on nile_cruises as a
-- denormalized write-through (display, CSV); the property is the source of
-- truth and the API keeps them in step.
ALTER TABLE nile_cruises
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES supplier_properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nile_cruises_property
  ON nile_cruises (property_id);

-- Backfill: every distinct (supplier_id, ship_name) already priced becomes a
-- ship under its supplier. Zero rows in production today; serves other
-- installs and the PGlite replay.
INSERT INTO supplier_properties (tenant_id, supplier_id, property_type, name, city)
SELECT DISTINCT nc.tenant_id, nc.supplier_id, 'ship', nc.ship_name, nc.embark_city
FROM nile_cruises nc
WHERE nc.supplier_id IS NOT NULL
  AND nc.ship_name IS NOT NULL AND btrim(nc.ship_name) <> ''
ON CONFLICT ON CONSTRAINT supplier_properties_unique_name DO NOTHING;

UPDATE nile_cruises nc
SET property_id = sp.id
FROM supplier_properties sp
WHERE nc.property_id IS NULL
  AND sp.supplier_id = nc.supplier_id
  AND sp.property_type = 'ship'
  AND sp.name = nc.ship_name;

-- ============================================================================
-- Retire the supplier-IS-a-property model
-- ============================================================================
DROP INDEX IF EXISTS idx_suppliers_is_property;
DROP INDEX IF EXISTS idx_suppliers_parent;
ALTER TABLE suppliers
  DROP COLUMN IF EXISTS is_property,
  DROP COLUMN IF EXISTS parent_supplier_id,
  DROP COLUMN IF EXISTS ship_name,
  DROP COLUMN IF EXISTS property_type;

COMMIT;
