-- ============================================================================
-- 333 — suppliers can be train operators
-- ============================================================================
-- The app has spoken of "train operators" since the train and sleeping-train
-- rate pages were built: they split suppliers by type = 'train_operator',
-- link to /suppliers?type=train_operator, and lib/supplier-properties maps
-- that role to the 'train' property type. But the suppliers CHECK constraint
-- (000, widened in 115) never allowed the value, so the only way to save a
-- railway was as "Other" — which is exactly what every tenant did (Egyptian
-- National Railways and Watania Sleeping Trains, filed as 'other', invisible
-- under any type tab; reported 2026-09-06). Allow the value and re-file them.
--
-- Idempotent: safe to re-run.

BEGIN;

ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_supplier_type_check;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_supplier_type_check
  CHECK (supplier_type IN (
    'hotel',
    'transport',
    'transport_company',
    'driver',
    'guide',
    'restaurant',
    'cruise',
    'airline',
    'activity',
    'activity_provider',
    'attraction',
    'tour_operator',
    'ground_handler',
    'train_operator',
    'shop',
    'other'
  ));

-- Backfill: railways that could only be saved as "Other". Both columns set
-- explicitly (sync_supplier_type mirrors them, but the intent should not
-- depend on a trigger). Only rows still filed as 'other' are touched.
UPDATE suppliers
SET type = 'train_operator', supplier_type = 'train_operator'
WHERE type = 'other'
  AND (company_name ILIKE '%railway%' OR company_name ILIKE '%train%');

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT company_name, type FROM suppliers WHERE type = 'train_operator';
