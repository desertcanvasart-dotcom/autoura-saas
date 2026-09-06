-- ============================================================================
-- 336 — an agency sells the cities it sells, not the whole country
-- ============================================================================
-- The destination catalog (294) lists every city of a country and a tenant
-- selects COUNTRIES. An agency that works Luxor and Aswan still saw 45
-- Egyptian cities in every dropdown. city_ids is the tenant's FOCUS within
-- a selected destination: NULL = every city in the catalog (today's
-- behaviour, and what a new tenant starts with), an array = only these.
-- Cities the tenant adds itself are appended to the focus by the API.
--
-- Idempotent: safe to re-run.

ALTER TABLE tenant_destinations
  ADD COLUMN IF NOT EXISTS city_ids UUID[];

COMMENT ON COLUMN tenant_destinations.city_ids IS
  'The cities this tenant sells within the destination; NULL = all catalog cities.';
