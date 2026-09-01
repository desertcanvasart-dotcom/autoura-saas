-- ============================================
-- Tipping rates gain a city
-- ============================================
-- Tips are not one number per role countrywide: what a driver is tipped in
-- Cairo is not what a driver is tipped in Aswan. The table had role and
-- context but no place, so a tenant could record only one figure per
-- role+context for their whole country.
--
-- NULL city keeps its existing meaning: "anywhere". Every row today is such a
-- row, so this changes no price on its own — the engine prefers a
-- city-specific rate and falls back to the country-wide one.

ALTER TABLE public.tipping_rates
  ADD COLUMN IF NOT EXISTS city TEXT;

-- The lookup filters by city on every priced day.
CREATE INDEX IF NOT EXISTS idx_tipping_rates_city
  ON public.tipping_rates (city);
