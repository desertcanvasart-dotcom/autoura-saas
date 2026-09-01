-- ============================================
-- Day tours are measured in hours, not days
-- ============================================
-- A single-day tour (day_tour / stopover) has always been forced to
-- duration_days = 1, duration_nights = 0 — which tells the traveller nothing
-- about whether it is a 4-hour half-day or a full 10-hour excursion. The form
-- now asks for hours on single-day tours; this column stores that.
--
-- NULL keeps its meaning: "not an hours-based tour" (i.e. a multi-day tour,
-- which continues to use duration_days/duration_nights). Adding a nullable
-- column changes no existing row and no existing price.

ALTER TABLE public.tour_templates
  ADD COLUMN IF NOT EXISTS duration_hours INTEGER;

COMMENT ON COLUMN public.tour_templates.duration_hours IS
  'Length of a single-day tour in hours (day_tour/stopover). NULL for multi-day tours, which use duration_days/duration_nights.';
