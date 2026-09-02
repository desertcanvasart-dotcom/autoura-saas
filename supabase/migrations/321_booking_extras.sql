-- ============================================================================
-- 321 — extras and upgrades sold AFTER the trip was sold (booking_extras)
-- ============================================================================
-- Port of travel-ops-pro's 20260828_booking_extras (+ the is_sellable_extra
-- split its extras catalogue needed), adapted to this app: tenants, not
-- organisations; bookings.total_amount, not total_cost; no payment_status /
-- deposit_paid columns (this app's record_booking_payment RPC and the
-- balance_due trigger own that), so the recompute writes only the money.
--
-- A customer who has bought a programme and then wants a second tour, a
-- business-class upgrade, an extra night: quote-time pricing (extras and
-- options in the B2B calculator) has no home for that. This is door 2.
--
-- THE ONE INVARIANT
--   total_amount = base_total_cost + extras_total
-- total_amount keeps meaning "what this customer owes for this trip", so
-- record_booking_payment(), the balance_due trigger, the invoices and every
-- dashboard keep working untouched. base_total_cost is stored separately so
-- a later add-traveller reprice divides the agreed price, never one
-- traveller's upgrade.
--
-- MONEY MOVES ONLY ON `confirmed`. requested/offered/accepted are conversation.

BEGIN;

CREATE TABLE IF NOT EXISTS booking_extras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  -- Set when the extra is one traveller's (their private portal link asked for
  -- it, or it is their upgrade); NULL means the party's.
  passenger_id UUID REFERENCES booking_passengers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'addon'
    CHECK (kind IN ('addon', 'upgrade')),
  title TEXT NOT NULL,
  description TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  -- Selling price per unit. NULL until the office prices it — never zero.
  unit_price NUMERIC,
  currency TEXT,
  supplier_cost NUMERIC,
  supplier_currency TEXT,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  -- Where it was picked from: 'package_option' | 'entrance_fee' |
  -- 'catalogue_extra' | 'manual'.
  source_kind TEXT,
  source_id UUID,
  replaces_service_id UUID,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'offered', 'accepted', 'confirmed', 'declined', 'withdrawn')),
  requested_via TEXT NOT NULL DEFAULT 'operator'
    CHECK (requested_via IN ('portal', 'operator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  priced_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  invoiced_at TIMESTAMPTZ,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A price and its currency are one fact; half of it is not a price.
  CONSTRAINT booking_extras_price_has_currency
    CHECK (unit_price IS NULL OR currency IS NOT NULL),
  CONSTRAINT booking_extras_cost_has_currency
    CHECK (supplier_cost IS NULL OR supplier_currency IS NOT NULL),
  CONSTRAINT booking_extras_price_not_negative
    CHECK (unit_price IS NULL OR unit_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_booking_extras_booking
  ON booking_extras (booking_id, status);
CREATE INDEX IF NOT EXISTS idx_booking_extras_tenant
  ON booking_extras (tenant_id);
CREATE INDEX IF NOT EXISTS idx_booking_extras_passenger
  ON booking_extras (passenger_id)
  WHERE passenger_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_booking_extras_unbilled
  ON booking_extras (booking_id)
  WHERE status = 'confirmed' AND invoiced_at IS NULL;

ALTER TABLE booking_extras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_extras_tenant ON booking_extras;
CREATE POLICY booking_extras_tenant ON booking_extras
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS booking_extras_service ON booking_extras;
CREATE POLICY booking_extras_service ON booking_extras
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- The booking keeps its agreed price separately from what extras added.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS base_total_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS extras_total NUMERIC;

COMMENT ON COLUMN bookings.base_total_cost IS
  'The agreed trip price WITHOUT extras. NULL = no extras have ever been confirmed, in which case total_amount is the base. Never divide total_amount per person — divide this.';
COMMENT ON COLUMN bookings.extras_total IS
  'Sum of CONFIRMED booking_extras in the booking currency. total_amount = coalesce(base_total_cost, total_amount) + coalesce(extras_total, 0).';

-- Attraction extras: a site the customer can pay to ADD. Deliberately a
-- separate flag from is_addon, which means "leave out of the automatic price"
-- — a different decision that does not imply this one. Backfilled from
-- is_addon once, as the sibling did, so nothing already offered disappears;
-- from here on the two are set independently.
ALTER TABLE entrance_fees
  ADD COLUMN IF NOT EXISTS is_sellable_extra BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE entrance_fees SET is_sellable_extra = TRUE
  WHERE is_addon IS TRUE AND is_sellable_extra IS FALSE;

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT to_regclass('public.booking_extras');                           -- not null
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_name = 'bookings' AND column_name IN ('base_total_cost','extras_total'); -- 2
--   SELECT count(*) FROM entrance_fees WHERE is_sellable_extra;             -- = former add-ons
-- Then regenerate types:  npm run types:generate
