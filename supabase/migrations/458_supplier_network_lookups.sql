-- ============================================
-- 458: supplier network lookups that an index can serve
-- ============================================
-- Code-quality audit 2026-10-31, SN-4 / SN-10 / SN-11. No data changes.
--
-- 1. Supplier sign-in (lib/supplier-claims recordsForPhone) found a phone's
--    records with a leading-wildcard ILIKE across three columns of every
--    agency's suppliers, capped at 200 rows: no index could serve it and a
--    real record could fall past the cap. Each record now stores the last 9
--    digits of each of its numbers (phone_tails, generated), GIN-indexed, and
--    sign-in matches by equality. The exact check with the agency's country
--    still runs afterwards, unchanged.
--
-- 2. booking_supplier_status had no index for the supplier's own page and
--    inbox (tenant_id + supplier_id) or for the daily jobs that pick lines by
--    date (client-day reminders: service_date = tomorrow; done-after-date:
--    service_date < today).
--
-- 3. The network search loaded up to 500 profiles and filtered them in
--    code. Kind, city and language now filter in the database: kinds as
--    stored (keys), cities and languages through lower-cased, trimmed copies
--    (case-insensitive, as the search always was), each GIN-indexed.

BEGIN;

-- ── 1. Phone tails ────────────────────────────────────────────────────

-- The last 9 digits of a number as typed ("+20 111-240 5969" → 112405969);
-- NULL when it has fewer than 9. Same as lib/supplier-accounts phoneTail
-- applied to the digits.
CREATE OR REPLACE FUNCTION public.phone_tail(p TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE WHEN length(d) >= 9 THEN right(d, 9) END
  FROM (SELECT regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') AS d) s
$$;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS phone_tails TEXT[]
  GENERATED ALWAYS AS (
    array_remove(ARRAY[public.phone_tail(whatsapp), public.phone_tail(phone), public.phone_tail(contact_phone)], NULL)
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_suppliers_phone_tails
  ON public.suppliers USING GIN (phone_tails);

-- ── 2. Service-booking lines ──────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_booking_supplier_status_tenant_supplier
  ON public.booking_supplier_status (tenant_id, supplier_id)
  WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_booking_supplier_status_service_date
  ON public.booking_supplier_status (service_date)
  WHERE service_date IS NOT NULL;

-- ── 3. Network search ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.search_words(p TEXT[])
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT coalesce(array_agg(lower(btrim(w))), '{}') FROM unnest(p) AS w
$$;

ALTER TABLE public.supplier_network_profiles
  ADD COLUMN IF NOT EXISTS search_cities TEXT[]
    GENERATED ALWAYS AS (public.search_words(cities)) STORED,
  ADD COLUMN IF NOT EXISTS search_languages TEXT[]
    GENERATED ALWAYS AS (public.search_words(languages)) STORED;

CREATE INDEX IF NOT EXISTS idx_supplier_network_profiles_kinds
  ON public.supplier_network_profiles USING GIN (kinds);
CREATE INDEX IF NOT EXISTS idx_supplier_network_profiles_search_cities
  ON public.supplier_network_profiles USING GIN (search_cities);
CREATE INDEX IF NOT EXISTS idx_supplier_network_profiles_search_languages
  ON public.supplier_network_profiles USING GIN (search_languages);

COMMIT;
