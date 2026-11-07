-- ============================================================================
-- 461 — a supplier may work in several cities, or travel everywhere
-- ============================================================================
-- Operator, 2026-11-07: "Now only one city can be assigned to a guide. A
-- throughout guide goes everywhere." A supplier row had one `city`, so a
-- Cairo-based guide who also works Luxor and Aswan never showed in the
-- picker for a Luxor day, and a throughout guide had no way to say "all".
--
--   other_cities      — the cities it ALSO works in, beyond its base `city`.
--                       `city` stays the base (home) city, unchanged, so no
--                       existing row, filter or export changes meaning.
--   works_all_cities  — it travels with the group everywhere (a throughout
--                       guide). It matches every city.
--
-- A supplier covers a city when: works_all_cities, OR city is that city, OR
-- other_cities contains it (lib/suppliers/supplier-cities.ts — one rule).
--
-- Pricing is NOT affected: guide prices live in guide_rates, matched by the
-- day's city there (lib/guides/guide-language.ts). This is about who can be
-- picked, not what is charged.
--
-- Live on 2026-11-07: 94 guide suppliers, each with exactly one city; after
-- this migration every one still covers exactly that city.
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS other_cities TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS works_all_cities BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN suppliers.other_cities IS
  'Cities the supplier also works in, beyond its base city. Empty = only the '
  'base city. Matched exactly against the agency''s destination city names.';
COMMENT ON COLUMN suppliers.works_all_cities IS
  'Travels everywhere (a throughout guide): covers every city. Default false.';

-- The picker asks "who works in Luxor?" — an array-contains lookup.
CREATE INDEX IF NOT EXISTS idx_suppliers_other_cities
  ON suppliers USING GIN (other_cities);

COMMIT;

-- ============================================================================
-- Verify after applying:
--   SELECT count(*) FROM suppliers WHERE other_cities <> '{}' OR works_all_cities;
--   -- 0 right after applying: nothing changes until the operator ticks them.
-- ============================================================================
