-- =====================================================================
-- Migration 234: Create exchange_rate_snapshots Table
-- Description: Append-only history of market FX rates. This is the source
--              of "the rate on the day the money moved" for the per-trip
--              P&L (see lib/fx-conversion.ts).
--
--              lib/currency-service.ts has read (getHistoricalRate) and
--              written (persistExchangeRate) this table since the currency
--              work landed, but the table itself was NEVER created in a
--              migration — so every insert was silently swallowed by the
--              function's try/catch and every lookup returned null. This
--              migration creates it and backfills one point per pair from
--              the existing `exchange_rates` table.
--
-- Why a second table: `exchange_rates` (migration 122) is UPSERTed on every
-- refresh and carries exactly one live row per (tenant, base, target). It
-- answers "what is the rate now". It cannot answer "what was the rate on
-- 14 March" because the previous value is overwritten. Snapshots are
-- append-only and never updated.
--
-- Not tenant-scoped: a market exchange rate is not tenant data. All tenants
-- read the same history. Writes are service-role only.
-- Date: 2026-07-26
-- =====================================================================

-- =====================================================================
-- 1. CREATE TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS exchange_rate_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Currency pair. Rate is expressed as: 1 base_currency = <rate> target_currency
  base_currency VARCHAR(3) NOT NULL,
  target_currency VARCHAR(3) NOT NULL,

  -- 8dp: EGP-per-EUR needs magnitude, inverse pairs need precision.
  rate DECIMAL(18, 8) NOT NULL CHECK (rate > 0),

  -- Provenance: 'er-api', 'exchange-rates-table', 'manual', ...
  source VARCHAR(50) NOT NULL DEFAULT 'er-api',

  -- When this rate was true. Lookups ask for the newest row with
  -- captured_at <= <date the money moved>.
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- A pair can only have one snapshot per instant. Makes the daily refresh
  -- idempotent if it runs twice with the same timestamp.
  UNIQUE (base_currency, target_currency, captured_at)
);

-- =====================================================================
-- 2. INDEXES
-- =====================================================================

-- The only read pattern: newest row for a pair on or before a date.
CREATE INDEX IF NOT EXISTS idx_exchange_rate_snapshots_pair_time
  ON exchange_rate_snapshots (base_currency, target_currency, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_exchange_rate_snapshots_captured_at
  ON exchange_rate_snapshots (captured_at DESC);

-- =====================================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================================

ALTER TABLE exchange_rate_snapshots ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user. Market rates carry no tenant information,
-- and the P&L runs under the caller's session client.
DROP POLICY IF EXISTS exchange_rate_snapshots_read ON exchange_rate_snapshots;
CREATE POLICY exchange_rate_snapshots_read ON exchange_rate_snapshots
  FOR SELECT
  TO authenticated
  USING (true);

-- Write: service role only. Rates are captured by the refresh job, never
-- by a user action — a tenant must not be able to rewrite FX history.
DROP POLICY IF EXISTS exchange_rate_snapshots_service_role ON exchange_rate_snapshots;
CREATE POLICY exchange_rate_snapshots_service_role ON exchange_rate_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================================
-- 4. BACKFILL — one starting point per pair from the live rates table
-- =====================================================================
-- Without this the history is empty until the first refresh runs, and every
-- P&L conversion falls back to today's live rate. Seeding from
-- exchange_rates gives each pair one honest data point, timestamped with
-- when that rate was actually fetched (not now).
--
-- Global (tenant_id IS NULL) rows only — per-tenant overrides are a tenant's
-- own commercial rate, not a market observation.

INSERT INTO exchange_rate_snapshots (base_currency, target_currency, rate, source, captured_at)
SELECT
  er.base_currency,
  er.target_currency,
  er.rate,
  'exchange-rates-table',
  COALESCE(er.last_updated_at, er.created_at, NOW())
FROM exchange_rates er
WHERE er.tenant_id IS NULL
  AND er.is_active = true
  AND er.rate > 0
ON CONFLICT (base_currency, target_currency, captured_at) DO NOTHING;

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  row_count INTEGER;
  pair_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM exchange_rate_snapshots;
  SELECT COUNT(DISTINCT (base_currency, target_currency)) INTO pair_count FROM exchange_rate_snapshots;
  RAISE NOTICE 'Migration 234 complete — exchange_rate_snapshots created, % snapshot(s) across % pair(s)', row_count, pair_count;
END $$;
