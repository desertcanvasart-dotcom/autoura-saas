-- ============================================================================
-- 315 — a dedicated extras catalogue
-- ============================================================================
-- Port of travel-ops-pro's 20260901_extras_catalogue, with one deliberate
-- difference.
--
-- THERE, is_addon had been overloaded: it meant "leave out of the automatic
-- price" AND the booking extras picker read it as "offer this for sale". The
-- fix split the second meaning into is_sellable_extra.
--
-- HERE it was never overloaded — this app has no booking-extras feature, and
-- is_addon is read only by lib/ai/service-creation.ts (`if (fee.is_addon)
-- continue`) and the AI content library. So NO SPLIT IS PORTED: adding a
-- second flag nothing reads would be inventing the confusion rather than
-- preventing it. If booking extras land here later, the parent's column and
-- its backfill port with them.
--
-- What IS ported is the missing table. Airport fast-track, extra luggage, a
-- late check-out: real things to sell that are not entrance fees and never
-- will be. Without somewhere to put them, the only way to offer one is to
-- invent an attraction — which pollutes the rate catalogue and mis-prices the
-- day the engine builds.

BEGIN;

CREATE TABLE IF NOT EXISTS extras_catalogue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  category TEXT,

  -- What we pay, in the tenant's rate currency. NULL is an honest hole (no
  -- supplier quote yet), never zero — usableRate() reads a blank rate as
  -- unpriced and the UI says so rather than implying "free".
  supplier_cost NUMERIC(12,2),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,

  -- A selling price the operator already decided. Set = that IS the price
  -- (off-margin). Blank = price from cost plus the tenant's margin.
  selling_price NUMERIC(12,2),

  unit TEXT NOT NULL DEFAULT 'per_person'
    CHECK (unit IN ('per_person', 'per_booking')),

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,

  CONSTRAINT extras_catalogue_unique_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_extras_catalogue_tenant
  ON extras_catalogue (tenant_id, is_active);

ALTER TABLE extras_catalogue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS extras_catalogue_tenant ON extras_catalogue;
CREATE POLICY extras_catalogue_tenant ON extras_catalogue
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS extras_catalogue_service ON extras_catalogue;
CREATE POLICY extras_catalogue_service ON extras_catalogue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
