-- ============================================================================
-- 319 — priced options on a tour variation
-- ============================================================================
--
-- An upgrade that belongs to ONE programme — a hot-air balloon on the Luxor
-- deluxe trip, a private felucca on the Aswan standard — is authored on its
-- variation, because a Standard and a Deluxe trip sell different upgrades at
-- different prices. Catalogue extras (extras_catalogue, migration 315) are
-- the things that go with ANY quote; these are the ones that go with THIS
-- variation.
--
-- Until now tour_variations.optional_extras was a plain JSON list of NAMES —
-- no cost, no price, nothing the engine could read — and the Extras page
-- pointed operators at "Tours → Options" as if it were priced. It was not.
--
-- Same money model as extras (lib/pricing/extras-pricing.ts): supplier_cost
-- is what we pay (NULL = not quoted yet, never zero); selling_price set = that
-- IS the price, off-margin; blank = cost plus the quote's margin. An option
-- with neither is an honest hole at quote time.
--
-- BACKFILL: every name already listed in optional_extras becomes an UNPRICED
-- option row on its variation, so no operator loses their list — it simply
-- shows "not priced" until they enter a cost. optional_extras itself is left
-- in place for the customer tour page, which still reads it.

BEGIN;

CREATE TABLE IF NOT EXISTS tour_variation_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  variation_id UUID NOT NULL REFERENCES tour_variations(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,

  -- What we pay, in the tenant's rate currency. NULL = no supplier quote yet.
  supplier_cost NUMERIC(12,2),
  -- A price the operator already decided. Set = that IS the price (off-margin).
  selling_price NUMERIC(12,2),

  unit TEXT NOT NULL DEFAULT 'per_person'
    CHECK (unit IN ('per_person', 'per_booking')),

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tour_variation_options_unique_name UNIQUE (variation_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tour_variation_options_variation
  ON tour_variation_options (variation_id, is_active);
CREATE INDEX IF NOT EXISTS idx_tour_variation_options_tenant
  ON tour_variation_options (tenant_id);

ALTER TABLE tour_variation_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tour_variation_options_tenant ON tour_variation_options;
CREATE POLICY tour_variation_options_tenant ON tour_variation_options
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS tour_variation_options_service ON tour_variation_options;
CREATE POLICY tour_variation_options_service ON tour_variation_options
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Backfill the legacy name lists as unpriced options. Names are trimmed and
-- de-duplicated per variation, keeping their listed order; blanks are skipped;
-- variations with no tenant (pre-multi-tenant rows) are skipped rather than
-- guessed at.
INSERT INTO tour_variation_options (tenant_id, variation_id, name, sort_order)
SELECT v.tenant_id, v.id, x.name, x.ord - 1
FROM tour_variations v
CROSS JOIN LATERAL (
  SELECT DISTINCT ON (btrim(e.value)) btrim(e.value) AS name, e.ord
  FROM jsonb_array_elements_text(
         CASE WHEN jsonb_typeof(v.optional_extras::jsonb) = 'array'
              THEN v.optional_extras::jsonb ELSE '[]'::jsonb END
       ) WITH ORDINALITY AS e(value, ord)
  WHERE btrim(e.value) <> ''
  ORDER BY btrim(e.value), e.ord
) x
WHERE v.tenant_id IS NOT NULL
ON CONFLICT (variation_id, name) DO NOTHING;

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT count(*) FROM tour_variation_options;             -- = backfilled names
--   SELECT count(*) FROM tour_variation_options
--    WHERE supplier_cost IS NULL AND selling_price IS NULL;  -- all of them, until priced
-- Then regenerate types:  npm run types:generate
