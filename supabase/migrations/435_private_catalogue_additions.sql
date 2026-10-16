-- ============================================
-- 435: countries and cities a company adds are its own
-- ============================================
-- The destination catalogue (294) is shared, and any company's owner or admin
-- could add a country or city to it (app/api/destination-catalog/manage) —
-- straight into every other company's dropdowns and AI vocabulary, with no
-- way to remove it. Signup is self-serve, so that was anyone on the internet.
-- Additions are now stamped with the company that made them and seen only by
-- it; the shared rows (added_by_tenant IS NULL) stay operator-curated.
-- Rows added before this cannot be told apart and stay shared.

BEGIN;

ALTER TABLE public.destination_catalog
  ADD COLUMN IF NOT EXISTS added_by_tenant UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.destination_cities
  ADD COLUMN IF NOT EXISTS added_by_tenant UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Uniqueness per audience: one shared row per code / city name, and one per
-- company among its own additions (two companies may each add "Peru").
ALTER TABLE public.destination_catalog DROP CONSTRAINT IF EXISTS destination_catalog_country_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS destination_catalog_code_shared
  ON public.destination_catalog (country_code) WHERE added_by_tenant IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS destination_catalog_code_own
  ON public.destination_catalog (added_by_tenant, country_code) WHERE added_by_tenant IS NOT NULL;

ALTER TABLE public.destination_cities DROP CONSTRAINT IF EXISTS destination_cities_catalog_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS destination_cities_name_shared
  ON public.destination_cities (catalog_id, name) WHERE added_by_tenant IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS destination_cities_name_own
  ON public.destination_cities (catalog_id, added_by_tenant, name) WHERE added_by_tenant IS NOT NULL;

DROP POLICY IF EXISTS destination_catalog_read ON public.destination_catalog;
CREATE POLICY destination_catalog_read ON public.destination_catalog
  FOR SELECT TO authenticated
  USING (added_by_tenant IS NULL OR added_by_tenant = (SELECT public.get_user_tenant_id()));

DROP POLICY IF EXISTS destination_cities_read ON public.destination_cities;
CREATE POLICY destination_cities_read ON public.destination_cities
  FOR SELECT TO authenticated
  USING (added_by_tenant IS NULL OR added_by_tenant = (SELECT public.get_user_tenant_id()));

COMMIT;
