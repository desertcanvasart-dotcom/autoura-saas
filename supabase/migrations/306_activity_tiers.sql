-- ============================================================================
-- 306 — tiered (group-size) activity pricing (C3.3)
-- ============================================================================
--
-- A felucca, a camel ride, a private boat: the per-person price falls as the
-- group grows, and the bands come from the supplier's own sheet. Today that
-- lives in b2b_pricing_rules — a separate table with FIXED tier1/tier2
-- columns, reachable only from the B2B engines, and disconnected from the
-- activity catalog the rest of the app prices from.
--
-- `tiers` puts the bands on the activity itself, as an ordered JSONB list, so
-- one activity carries as many bands as its contract does:
--
--   [{ "min_pax": 1, "max_pax": 4, "rate_eur": 25, "label": "Small boat" },
--    { "min_pax": 5, "max_pax": 12, "rate_eur": 18 }]
--
-- Used when pricing_type = 'tiered'. NULL means the activity prices from its
-- flat base_rate columns exactly as before, so applying this changes nothing
-- until an operator enters bands.

BEGIN;

ALTER TABLE activity_rates ADD COLUMN IF NOT EXISTS tiers JSONB;

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT count(*) FROM information_schema.columns
--   WHERE table_name = 'activity_rates' AND column_name = 'tiers';   -- 1
--   SELECT count(*) FROM activity_rates WHERE tiers IS NOT NULL;     -- 0
