-- ============================================================================
-- 354 — exactly one preferred hotel / ship / restaurant per scope
-- ============================================================================
-- Migration 353 made is_preferred the engine's tie-breaker among several
-- candidates in one city + tier: exactly ONE preferred row is used, none or
-- several is a pricing hole. The rates UI now sets the flag with a star that
-- clears its siblings (lib/rates/preferred.ts); this index guarantees the
-- invariant the engine relies on regardless of the write path.
--
-- Scopes mirror the engine's candidate pools:
--   accommodation_rates  tenant + city + tier        (getHotelRates)
--   nile_cruises         tenant + tier               (getCruiseRates)
--   meal_rates           tenant + tier + meal_type   (getMealRates, per meal)
-- guides have no index: their pool is also filtered by language (an array),
-- so one preferred guide per language is legitimate and not expressible here.
--
-- Existing duplicates are demoted first, keeping the most recently updated
-- row, so the index can be created on a live database.
-- ============================================================================

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY coalesce(tenant_id::text, ''), lower(coalesce(city, '')), coalesce(tier, '')
    ORDER BY updated_at DESC NULLS LAST, id
  ) AS rn
  FROM accommodation_rates WHERE is_preferred
)
UPDATE accommodation_rates a SET is_preferred = false FROM ranked r WHERE a.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS accommodation_rates_one_preferred_idx
  ON accommodation_rates (coalesce(tenant_id::text, ''), lower(coalesce(city, '')), coalesce(tier, ''))
  WHERE is_preferred;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY coalesce(tenant_id::text, ''), coalesce(tier, '')
    ORDER BY updated_at DESC NULLS LAST, id
  ) AS rn
  FROM nile_cruises WHERE is_preferred
)
UPDATE nile_cruises c SET is_preferred = false FROM ranked r WHERE c.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS nile_cruises_one_preferred_idx
  ON nile_cruises (coalesce(tenant_id::text, ''), coalesce(tier, ''))
  WHERE is_preferred;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY coalesce(tenant_id::text, ''), coalesce(tier, ''), lower(coalesce(meal_type, ''))
    ORDER BY updated_at DESC NULLS LAST, id
  ) AS rn
  FROM meal_rates WHERE is_preferred
)
UPDATE meal_rates m SET is_preferred = false FROM ranked r WHERE m.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS meal_rates_one_preferred_idx
  ON meal_rates (coalesce(tenant_id::text, ''), coalesce(tier, ''), lower(coalesce(meal_type, '')))
  WHERE is_preferred;
