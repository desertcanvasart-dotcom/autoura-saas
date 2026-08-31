-- ============================================================================
-- 312 — supplier properties, Phase 2: hotels
-- ============================================================================
-- Same shape as 311 (cruises): the accommodation rate keeps its denormalized
-- property_name and gains a property_id link to the hotel as a sub-entity of
-- its supplier. Backfill creates a hotel property for every supplier-linked
-- (supplier_id, property_name) already priced; rows with no supplier stay
-- unlinked and link up on their next save with a supplier chosen.

BEGIN;

ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES supplier_properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_accommodation_rates_property
  ON accommodation_rates (property_id);

INSERT INTO supplier_properties (tenant_id, supplier_id, property_type, name, city)
SELECT DISTINCT ar.tenant_id, ar.supplier_id, 'hotel', ar.property_name, ar.city
FROM accommodation_rates ar
WHERE ar.supplier_id IS NOT NULL
  AND ar.property_name IS NOT NULL AND btrim(ar.property_name) <> ''
ON CONFLICT ON CONSTRAINT supplier_properties_unique_name DO NOTHING;

UPDATE accommodation_rates ar
SET property_id = sp.id
FROM supplier_properties sp
WHERE ar.property_id IS NULL
  AND sp.supplier_id = ar.supplier_id
  AND sp.property_type = 'hotel'
  AND sp.name = ar.property_name;

COMMIT;
