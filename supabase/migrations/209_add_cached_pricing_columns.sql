-- =====================================================================
-- Migration 209: Add Cached Pricing Columns to tour_templates
-- Description: Store pre-calculated "starting from" prices to speed up
--              the browse page (avoids recomputing the engine per card).
-- Populated by: POST /api/tours/recalculate-prices  (manual or cron)
-- Date: 2026-06-22
-- =====================================================================

ALTER TABLE tour_templates
  ADD COLUMN IF NOT EXISTS cached_starting_price DECIMAL(10, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cached_starting_tier VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cached_price_updated_at TIMESTAMPTZ DEFAULT NULL;

-- Index for faster browse-page queries on active templates with a cached price
CREATE INDEX IF NOT EXISTS idx_tour_templates_cached_price
  ON tour_templates(cached_starting_price)
  WHERE is_active = true;

COMMENT ON COLUMN tour_templates.cached_starting_price IS 'Pre-calculated starting-from price for browse display (populated by /api/tours/recalculate-prices)';
COMMENT ON COLUMN tour_templates.cached_starting_tier IS 'The tier (budget/standard/deluxe/luxury) of the cached price';
COMMENT ON COLUMN tour_templates.cached_price_updated_at IS 'When the cached price was last calculated';

-- NOTE: We intentionally do NOT seed these columns with a duration-based
-- estimate (the sibling app seeds `duration_days * 150`). Consistent with the
-- pricing harness — prices are left NULL until the engine computes a real,
-- rate-backed "starting from" value via the recalculate-prices route.
