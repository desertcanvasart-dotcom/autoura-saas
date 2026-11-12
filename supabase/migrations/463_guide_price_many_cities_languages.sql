-- ============================================================================
-- 463 — one guide price covers several cities and several languages
-- ============================================================================
-- Operator, 2026-11-12: "when I select a guide and add 3 or 4 cities, the
-- system creates the same guide 3 or 4 times." Since #803 the guide price
-- form saved one guide_rates row per city × language it ticked: Ahmed Hassan,
-- English, Aswan + Edfu + Kom Ombo was three prices (GD-2MVROB, -2, -3). One
-- price became several to edit, and copies that drift apart become a
-- conflict the engine has to refuse.
--
-- A guide price now names its cities and languages as lists, the way a
-- supplier does since 461:
--
--   city / guide_language — the first city and the first language, as before
--                           (every existing filter, export and display keeps
--                           its meaning).
--   other_cities          — the cities the SAME price also covers.
--   other_languages       — the languages the SAME price also covers
--                           (guide_language vocabulary keys).
--
-- A price covers a day when the day's city is `city` or in `other_cities`
-- and the trip's language is `guide_language` or in `other_languages`
-- (lib/guides/guide-language.ts — one rule). A price with no city is still
-- the "any city" price, so it cannot list other cities (CHECK below).
--
-- THE MERGE. Only what the #803 form fanned out is merged: rows saved by one
-- insert (same tenant, same created_at), whose codes are exactly BASE,
-- BASE-2 … BASE-n, with every price field equal and the city × language
-- pairs a complete grid. The BASE row is kept and takes the lists; anything
-- that points at a copy (itinerary_services / tour_variation_services
-- .rate_id) is moved to it; the copies are deleted. Rows the operator
-- entered one by one are never touched, even at equal prices.
--
-- Live on 2026-11-12: 5 such groups (19 rows → 5); the 14 copies are
-- referenced only by rate_audit_log, which keeps its history as it is.
--
-- Idempotent: safe to re-run (a merged group has one row left).
-- ============================================================================

BEGIN;

ALTER TABLE guide_rates
  ADD COLUMN IF NOT EXISTS other_cities TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS other_languages TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN guide_rates.other_cities IS
  'Cities this same price also covers, beyond city. Empty = only city (or, '
  'with no city, any city).';
COMMENT ON COLUMN guide_rates.other_languages IS
  'Languages (guide_language vocabulary keys) this same price also covers, '
  'beyond guide_language.';

-- ---- Merge the fan-out copies ---------------------------------------------
DO $$
DECLARE
  g RECORD;
  keeper_id UUID;
  copy_ids UUID[];
  merged INT := 0;
BEGIN
  FOR g IN
    WITH fan AS (
      SELECT r.*,
             regexp_replace(r.service_code, '-[0-9]+$', '') AS base,
             count(*) OVER (PARTITION BY r.tenant_id, regexp_replace(r.service_code, '-[0-9]+$', ''), r.created_at) AS group_n
        FROM guide_rates r
       WHERE r.service_code ~ '^[A-Za-z0-9]+-[A-Za-z0-9]+(-[0-9]+)?$'
    )
    SELECT tenant_id, base, created_at,
           array_agg(id ORDER BY (service_code <> base), length(service_code), service_code) AS ids,
           count(*) AS n
      FROM fan
     GROUP BY tenant_id, base, created_at
    HAVING count(*) > 1
       -- the codes are exactly BASE, BASE-2 … BASE-n
       AND bool_or(service_code = base)
       AND count(DISTINCT service_code) = count(*)
       AND bool_and(service_code = base OR substring(service_code FROM '-([0-9]+)$')::int BETWEEN 2 AND group_n)
       -- one price, said once
       AND count(DISTINCT concat_ws('|',
             supplier_id::text, guide_type, coalesce(guide_mode, 'spot'), tour_duration,
             base_rate_eur::text, base_rate_non_eur::text, coalesce(rate_currency, ''),
             coalesce(season, ''), coalesce(rate_valid_from::text, ''), coalesce(rate_valid_to::text, ''),
             is_active::text)) = 1
       -- every pair names a city, and the pairs are a full city × language grid
       AND bool_and(city IS NOT NULL AND btrim(city) <> '')
       AND count(*) = count(DISTINCT lower(btrim(city))) * count(DISTINCT guide_language)
  LOOP
    keeper_id := g.ids[1];
    copy_ids := g.ids[2:];

    UPDATE guide_rates k
       SET other_cities = coalesce((
             SELECT array_agg(c ORDER BY first_code)
               FROM (SELECT btrim(r.city) AS c, min(r.service_code) AS first_code
                       FROM guide_rates r
                      WHERE r.id = ANY(g.ids)
                        AND lower(btrim(r.city)) <> lower(btrim(k.city))
                      GROUP BY btrim(r.city)) x), '{}'),
           other_languages = coalesce((
             SELECT array_agg(l ORDER BY first_code)
               FROM (SELECT r.guide_language AS l, min(r.service_code) AS first_code
                       FROM guide_rates r
                      WHERE r.id = ANY(g.ids)
                        AND r.guide_language <> k.guide_language
                      GROUP BY r.guide_language) y), '{}')
     WHERE k.id = keeper_id;

    -- Whatever was priced from a copy is now priced from the one price.
    UPDATE itinerary_services SET rate_id = keeper_id WHERE rate_id = ANY(copy_ids);
    UPDATE tour_variation_services SET rate_id = keeper_id WHERE rate_id = ANY(copy_ids);

    DELETE FROM guide_rates WHERE id = ANY(copy_ids);
    merged := merged + 1;
  END LOOP;
  RAISE NOTICE '463: merged % fanned-out guide price group(s)', merged;
END $$;

-- An "any city" price is the fallback for every city; it cannot also list some.
ALTER TABLE guide_rates DROP CONSTRAINT IF EXISTS guide_rates_other_cities_need_city;
ALTER TABLE guide_rates ADD CONSTRAINT guide_rates_other_cities_need_city
  CHECK (other_cities = '{}' OR (city IS NOT NULL AND btrim(city) <> ''));

COMMIT;

-- ============================================================================
-- Verify after applying:
--   SELECT service_code, city, other_cities, guide_language, other_languages
--     FROM guide_rates WHERE other_cities <> '{}' OR other_languages <> '{}';
--   -- 2026-11-12: 5 rows (GD-0S5KTE, GD-2E1MC0, GD-2MVROB, GD-6XJLGT, GD-A8KCOZ)
--   SELECT count(*) FROM guide_rates WHERE service_code ~ '^GD-[A-Z0-9]{6}-[0-9]+$';
--   -- 0
-- ============================================================================
