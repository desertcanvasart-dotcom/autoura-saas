-- ============================================
-- Hotel services (porter, check-in/out assistance) gain a city
-- ============================================
-- What a porter or check-in assistant costs in Cairo is not what it costs in
-- Aswan. NULL city keeps its meaning: "anywhere" — every row today — so this
-- changes no price by itself. The engine prefers the day's city and falls
-- back to the anywhere row (same rule as tipping, migration 316).

ALTER TABLE public.hotel_staff_rates
  ADD COLUMN IF NOT EXISTS city TEXT;
