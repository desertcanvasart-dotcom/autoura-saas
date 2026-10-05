-- ============================================
-- 395: the expense categories the forms actually save
-- ============================================
-- Migration 006 limited expenses.category to accommodation, transportation,
-- guide, meals, entrance_fees, tips, flights, cruise, other — but the expense
-- forms have always saved meal, hotel, driver, entrance, tipping, … (now one
-- list, lib/expense-categories.ts). Where 006's CHECK is live, those inserts
-- were refused. This replaces it with every value either side uses.
--
-- NOT VALID: rows already stored are not re-checked (production has drifted
-- from the migrations before — see 374), only new and updated ones.
-- Replay-safe: drops whichever category CHECK is there, by definition.

BEGIN;

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.expenses'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%category%'
  LOOP
    EXECUTE format('ALTER TABLE public.expenses DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_category_check CHECK (category IN (
    -- the forms (lib/expense-categories.ts)
    'guide', 'driver', 'hotel', 'cruise', 'transportation', 'flights',
    'entrance', 'meal', 'activity', 'airport_staff', 'hotel_staff',
    'ground_handler', 'tipping', 'permits', 'toll', 'parking', 'fuel',
    'office', 'marketing', 'software', 'other',
    -- 006's originals, still on older rows
    'accommodation', 'meals', 'entrance_fees', 'tips'
  )) NOT VALID;

COMMIT;
