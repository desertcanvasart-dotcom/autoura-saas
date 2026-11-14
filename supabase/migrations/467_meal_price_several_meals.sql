-- ============================================================================
-- 467 — one meal price covers several meals (lunch and dinner)
-- ============================================================================
-- Operator, 2026-11-14: "the same meal sometimes works for lunch and dinner,
-- so we don't have to make duplicates by adding the same meal, the same
-- price, the same restaurant, once for lunch and another for dinner … similar
-- to what we have done with guide."
--
-- A meal price now names its meals as a list, the way a guide price names
-- its cities and languages since 463:
--
--   meal_type        — the first meal, as before (every existing filter,
--                      export and display keeps its meaning).
--   other_meal_types — the meals the SAME price also covers (meal_type
--                      vocabulary keys).
--
-- A price serves a meal when the meal is `meal_type` or in
-- `other_meal_types` (lib/meals/meal-rate-meals.ts — one rule).
--
-- NO ROWS ARE MERGED. Live on 2026-11-14 no restaurant holds the same price
-- twice for two meals (only the Sandbox prices lunch and dinner apart, at
-- different figures), so there is nothing to fold together; the operator
-- adds a second meal to a price in Rates → Meals.
--
-- The preferred star stays one per tier and meal. The index from 354 still
-- holds for the first meal; a star on a price that ALSO covers another meal
-- clears the stars it overlaps in the app (lib/rates/preferred.ts), since an
-- index cannot compare lists.
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

ALTER TABLE meal_rates
  ADD COLUMN IF NOT EXISTS other_meal_types TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN meal_rates.other_meal_types IS
  'Meals (meal_type vocabulary keys) this same price also covers, beyond '
  'meal_type. Empty = only meal_type.';

-- The first meal is said in meal_type; a price cannot list further meals
-- without one.
ALTER TABLE meal_rates DROP CONSTRAINT IF EXISTS meal_rates_other_meals_need_meal;
ALTER TABLE meal_rates ADD CONSTRAINT meal_rates_other_meals_need_meal
  CHECK (other_meal_types = '{}' OR (meal_type IS NOT NULL AND btrim(meal_type) <> ''));

COMMIT;

-- ============================================================================
-- Verify after applying:
--   SELECT count(*) FROM meal_rates WHERE other_meal_types <> '{}';
--   -- 0 (until a price is given a second meal in Rates → Meals)
-- ============================================================================
