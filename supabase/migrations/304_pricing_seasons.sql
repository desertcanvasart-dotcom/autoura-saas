-- ============================================================================
-- 304 — the operator's demand premium (C3.1)
-- ============================================================================
--
-- Supplier seasonality already lives on the rate rows: a hotel costs more in
-- its own high season and the engine picks that up from the travel date.
-- This is the OTHER kind — the agency's own judgement that a date sells out
-- and is worth more. It therefore sits AFTER margin, on the selling price,
-- and never touches supplier cost: cost is what somebody charged us, this is
-- what the operator has decided to ask.
--
-- Two tables because a season is a NAME the operator reuses ("New Year",
-- "Easter") and its dates move every year: one premium, many dated windows.
--
-- Overlaps are expected (a broad "winter peak" over a narrow "New Year") and
-- resolved in code by taking the HIGHEST premium — never the sum, which would
-- turn two 15% seasons into 32.25%.

BEGIN;

CREATE TABLE IF NOT EXISTS pricing_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name VARCHAR(80) NOT NULL,

  -- Added to the selling price. 15 means +15%. Zero is legitimate — a season
  -- worth naming and watching before deciding to charge for it.
  uplift_percent NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (uplift_percent >= 0 AND uplift_percent <= 200),

  -- For the calendar, so a glance shows which dates are which.
  colour VARCHAR(7) NOT NULL DEFAULT '#647C47',

  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS pricing_season_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  season_id UUID NOT NULL REFERENCES pricing_seasons(id) ON DELETE CASCADE,

  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- The operator's own label: "Easter 2027", "New Year 2026/27".
  label VARCHAR(120),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (end_date >= start_date)
);

-- The lookup is always "which window contains this departure date", so the
-- index leads with the dates.
CREATE INDEX IF NOT EXISTS idx_season_dates_lookup
  ON pricing_season_dates (tenant_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_season_dates_season
  ON pricing_season_dates (season_id);

ALTER TABLE pricing_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_season_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pricing_seasons_tenant ON pricing_seasons;
CREATE POLICY pricing_seasons_tenant ON pricing_seasons
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS pricing_seasons_service ON pricing_seasons;
CREATE POLICY pricing_seasons_service ON pricing_seasons
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS pricing_season_dates_tenant ON pricing_season_dates;
CREATE POLICY pricing_season_dates_tenant ON pricing_season_dates
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS pricing_season_dates_service ON pricing_season_dates;
CREATE POLICY pricing_season_dates_service ON pricing_season_dates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT count(*) FROM information_schema.columns
--   WHERE table_name = 'pricing_seasons';        -- expect 9
--   SELECT count(*) FROM information_schema.columns
--   WHERE table_name = 'pricing_season_dates';   -- expect 7
