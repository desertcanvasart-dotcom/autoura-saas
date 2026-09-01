-- ============================================================================
-- 318 — retire b2b_pricing_rules
-- ============================================================================
--
-- b2b_pricing_rules (created in migration 232, tenant_id + RLS in 223) held
-- fixed tier1..tier4 activity pricing, reachable only from the B2B engines and
-- disconnected from the activity catalog the rest of the app prices from.
--
-- Migration 306 moved group-size bands onto the activity itself
-- (activity_rates.tiers), and the app now manages ALL activity pricing —
-- per-person, per-unit, flat, and tiered (volume discount) — under
-- Activities & Add-ons (/rates/activities). The calculate-price and
-- quote-from-itinerary engines no longer read b2b_pricing_rules, and the
-- /b2b/pricing-rules page is now Transport Packages only (b2b_transport_packages,
-- which this migration deliberately LEAVES in place).
--
-- Nothing references this table by foreign key (its own rate_id was an
-- unconstrained UUID; the only FK was its own tenant_id -> tenants). Dropping
-- it therefore has no cascade impact. RLS policies drop with the table.
--
-- PREREQUISITE: confirm no un-migrated rows remain before applying. The B2B
-- engines already ignore this table, so any surviving rows are dead weight,
-- but a quick check documents intent:
--
--   SELECT count(*) FROM b2b_pricing_rules;   -- expected: 0 (or test rows only)
--
-- If real volume-discount rules were entered here, recreate them under
-- Activities & Add-ons (pricing type "Tiered") BEFORE applying this.

BEGIN;

DROP TABLE IF EXISTS b2b_pricing_rules;

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT to_regclass('public.b2b_pricing_rules');   -- expected: NULL
