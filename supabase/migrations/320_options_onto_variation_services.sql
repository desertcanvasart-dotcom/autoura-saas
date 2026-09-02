-- ============================================================================
-- 320 — priced options become optional SERVICE lines (align with travel-ops-pro)
-- ============================================================================
--
-- Migration 319 gave this app a dedicated tour_variation_options table. The
-- sibling app (travel-ops-pro) spells the same fact differently, and had done
-- so first: a priced option is a row of tour_variation_services with
-- is_optional = TRUE, its cost in cost_per_unit, and — when the operator has
-- decided one — optional_price_override. Its quote engine honours that column
-- off-margin (lib/b2b/optional-pricing), and its booking-time extras read the
-- same rows as "package options". This app already carried both columns and
-- read neither.
--
-- Decided 2026-09-02: one spelling across both apps, the sibling's. So every
-- option row moves onto its variation as an optional service, and the
-- dedicated table goes.
--
-- Mapping
--   name          -> service_name
--   description   -> notes
--   supplier_cost -> cost_per_unit         (NULL stays NULL: not priced)
--   selling_price -> optional_price_override
--   unit          -> quantity_mode  per_person -> 'per_pax', per_booking -> 'fixed'
--   service_category = 'option', rate_type/rate_id NULL, quantity_value 1,
--   sequence_order appended after the variation's existing services.
--   Inactive options are not carried: the services model has no on/off flag,
--   and an option nobody was offering should not start being offered.
--
-- Idempotent: an optional service with the same name already on the variation
-- is left alone rather than duplicated.

BEGIN;

INSERT INTO tour_variation_services (
  tenant_id, variation_id, service_name, service_category, rate_type, rate_id,
  quantity_mode, quantity_value, cost_per_unit, day_number, sequence_order,
  is_optional, optional_price_override, notes
)
SELECT
  o.tenant_id,
  o.variation_id,
  o.name,
  'option',
  NULL,
  NULL,
  CASE o.unit WHEN 'per_booking' THEN 'fixed' ELSE 'per_pax' END,
  1,
  o.supplier_cost,
  NULL,
  COALESCE((SELECT MAX(s.sequence_order) FROM tour_variation_services s WHERE s.variation_id = o.variation_id), 0)
    + o.sort_order + 1,
  TRUE,
  o.selling_price,
  o.description
FROM tour_variation_options o
WHERE o.is_active
  AND NOT EXISTS (
    SELECT 1 FROM tour_variation_services s
    WHERE s.variation_id = o.variation_id
      AND s.is_optional
      AND s.service_name = o.name
  );

DROP TABLE tour_variation_options;

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT to_regclass('public.tour_variation_options');           -- NULL
--   SELECT count(*) FROM tour_variation_services WHERE is_optional; -- >= the moved rows
-- Then regenerate types:  npm run types:generate
