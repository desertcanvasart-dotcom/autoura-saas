-- ============================================================================
-- 404 — a night's voucher checks out the morning after its last night
-- ============================================================================
--
-- Generate set a hotel or cruise voucher's check-out to the date of its LAST
-- NIGHT: nights on Oct 1, 2 and 3 printed "check-out Oct 3, 2 nights" (live
-- HV-2026-0001, ITN-S-2026-8987). The generator now writes the day after
-- (lib/documents/plan-supplier-documents.ts).
--
-- This corrects the vouchers it already wrote: a hotel or cruise voucher
-- whose check-out is the same day as its last dated line. A voucher whose
-- check-out was set by hand to anything else is left alone. Data only;
-- replay-safe (a second run finds nothing to change).
-- ============================================================================

BEGIN;

WITH last_night AS (
  SELECT d.id, max((line->>'date')::date) AS night
    FROM supplier_documents d
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(d.services) = 'array' THEN d.services ELSE '[]'::jsonb END
    ) AS line
   WHERE d.document_type IN ('hotel_voucher', 'cruise_voucher')
     AND d.check_out IS NOT NULL
     AND line->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
   GROUP BY d.id
)
UPDATE supplier_documents d
   SET check_out = (l.night + 1)
  FROM last_night l
 WHERE d.id = l.id
   AND d.check_out::date = l.night;

COMMIT;
