-- ============================================
-- 379: a hotel or cruise rate IS its dated periods — the default price becomes period 1
-- ============================================
-- A rate row can carry dated contract periods (`seasons`, migration 305). On
-- production NOT ONE does: all 132 cruises and all 34 priced hotels are priced
-- from their base columns — the "Default rate" of the rate form — and the
-- engine applies that price to ANY travel date, ignoring the validity dates
-- sitting on the same row (rate_valid_from / rate_valid_to). A cruise rate
-- valid October 2026 – April 2027 prices a July 2027 departure, marked
-- complete.
--
-- The operator's decision (2026-09-22): convert the default into a dated
-- period. Each such row gets ONE period, covering exactly its own validity
-- dates, at exactly the price it is charged today:
--
--     name   'Contract rate'
--     from   rate_valid_from        to   rate_valid_to
--     rates  what the engine resolves for the row now — see below
--
-- After it, a night inside the window prices as before, to the cent; a night
-- OUTSIDE it is a gap naming the date ("…has rate periods, but none covers
-- 2027-07-10"), which is what a contract that has run out means. A read with
-- no travel date (the tours list, the pricing grid) still gets period 1.
--
-- WHAT THE ENGINE RESOLVES TODAY (lib/auto-pricing-service.ts, the legacy path)
--   hotel   ppd    = ppd_eur, else double_rate_eur / 2   (all 34 live rows: the latter)
--           single = single_supplement_eur, else max(0, single_rate_eur − ppd)
--           triple = triple_reduction_eur, else 0
--   cruise  ppd / single / triple = the three base columns (all 132 live rows)
-- The non-EU set is filled the same way from its own columns, else mirrors the
-- EU set. The guide bed is 0 = "no concession entered", as on every row today.
--
-- ONLY rows that (a) have no stored periods, (b) have a price, and (c) have BOTH
-- validity dates in order. Sillage Egypte's 18 hotels have no price: they are
-- left alone (a gap before, a gap after). The base columns are set to period 1
-- too — the mirror the rate form writes on every save — so date-less readers
-- see the same number.
--
-- CHANGES PRODUCTION DATA (166 rows on 2026-09-22). Apply AFTER the code in the
-- same change is deployed: that code puts the period's price last on save, so
-- editing a converted rate cannot write a stale base price back. Idempotent: a
-- row that has periods is never touched again.

-- ---- hotels ----
WITH priced AS (
  SELECT id,
         COALESCE(NULLIF(ppd_eur, 0), NULLIF(double_rate_eur, 0) / 2.0) AS ppd,
         -- A non-EU room rate of 0 is "not entered", not a free room: it then
         -- mirrors the EU price, as the rate form does.
         COALESCE(NULLIF(ppd_non_eur, 0), NULLIF(double_rate_non_eur, 0) / 2.0) AS ppd_non
    FROM public.accommodation_rates
   WHERE (seasons IS NULL OR jsonb_typeof(seasons) <> 'array' OR jsonb_array_length(seasons) = 0)
     AND rate_valid_from IS NOT NULL AND rate_valid_to IS NOT NULL AND rate_valid_from <= rate_valid_to
), resolved AS (
  SELECT a.id, p.ppd,
         COALESCE(a.single_supplement_eur, GREATEST(0, COALESCE(a.single_rate_eur, 0) - p.ppd)) AS single_supp,
         COALESCE(a.triple_reduction_eur, 0) AS triple_red,
         COALESCE(p.ppd_non, p.ppd) AS ppd_non,
         COALESCE(a.single_supplement_non_eur,
                  CASE WHEN p.ppd_non IS NOT NULL THEN GREATEST(0, COALESCE(a.single_rate_non_eur, 0) - p.ppd_non) END,
                  COALESCE(a.single_supplement_eur, GREATEST(0, COALESCE(a.single_rate_eur, 0) - p.ppd))) AS single_supp_non,
         COALESCE(a.triple_reduction_non_eur, a.triple_reduction_eur, 0) AS triple_red_non
    FROM public.accommodation_rates a JOIN priced p ON p.id = a.id
   WHERE p.ppd > 0
)
UPDATE public.accommodation_rates a
   SET seasons = jsonb_build_array(jsonb_build_object(
         'name', 'Contract rate',
         'from', to_char(a.rate_valid_from, 'YYYY-MM-DD'),
         'to',   to_char(a.rate_valid_to,   'YYYY-MM-DD'),
         'rates', jsonb_build_object(
           'ppd_eur', r.ppd, 'single_supplement_eur', r.single_supp, 'triple_reduction_eur', r.triple_red,
           'ppd_non_eur', r.ppd_non, 'single_supplement_non_eur', r.single_supp_non, 'triple_reduction_non_eur', r.triple_red_non,
           'guide_rate_eur', 0))),
       -- the mirror (lib/rates/rate-seasons.ts legacyColumnMirror)
       low_season_from = a.rate_valid_from, low_season_to = a.rate_valid_to,
       ppd_eur = r.ppd, single_supplement_eur = r.single_supp, triple_reduction_eur = r.triple_red,
       ppd_non_eur = r.ppd_non, single_supplement_non_eur = r.single_supp_non, triple_reduction_non_eur = r.triple_red_non
  FROM resolved r
 WHERE r.id = a.id;

-- ---- cruises ----
UPDATE public.nile_cruises c
   SET seasons = jsonb_build_array(jsonb_build_object(
         'name', 'Contract rate',
         'from', to_char(c.rate_valid_from, 'YYYY-MM-DD'),
         'to',   to_char(c.rate_valid_to,   'YYYY-MM-DD'),
         'rates', jsonb_build_object(
           'ppd_eur', c.ppd_eur,
           'single_supplement_eur', COALESCE(c.single_supplement_eur, 0),
           'triple_reduction_eur', COALESCE(c.triple_reduction_eur, 0),
           'ppd_non_eur', COALESCE(NULLIF(c.ppd_non_eur, 0), c.ppd_eur),
           'single_supplement_non_eur', COALESCE(c.single_supplement_non_eur, c.single_supplement_eur, 0),
           'triple_reduction_non_eur', COALESCE(c.triple_reduction_non_eur, c.triple_reduction_eur, 0),
           'guide_rate_eur', 0))),
       low_season_start = c.rate_valid_from, low_season_end = c.rate_valid_to
 WHERE (c.seasons IS NULL OR jsonb_typeof(c.seasons) <> 'array' OR jsonb_array_length(c.seasons) = 0)
   AND c.ppd_eur > 0
   AND c.rate_valid_from IS NOT NULL AND c.rate_valid_to IS NOT NULL AND c.rate_valid_from <= c.rate_valid_to;

-- ---- it did what it says, or it does nothing ----
DO $$
DECLARE
  bad INT;
BEGIN
  SELECT count(*) INTO bad FROM public.accommodation_rates
   WHERE jsonb_typeof(seasons) = 'array' AND jsonb_array_length(seasons) = 1
     AND seasons->0->>'name' = 'Contract rate'
     AND ((seasons->0->'rates'->>'ppd_eur')::numeric IS DISTINCT FROM ppd_eur
          OR NOT ((seasons->0->'rates'->>'ppd_eur')::numeric > 0)
          OR (seasons->0->>'from')::date IS DISTINCT FROM rate_valid_from
          OR (seasons->0->>'to')::date IS DISTINCT FROM rate_valid_to);
  IF bad > 0 THEN RAISE EXCEPTION '379: % converted hotel rate(s) do not carry their own price and dates — nothing is kept', bad; END IF;

  SELECT count(*) INTO bad FROM public.nile_cruises
   WHERE jsonb_typeof(seasons) = 'array' AND jsonb_array_length(seasons) = 1
     AND seasons->0->>'name' = 'Contract rate'
     AND ((seasons->0->'rates'->>'ppd_eur')::numeric IS DISTINCT FROM ppd_eur
          OR (seasons->0->>'from')::date IS DISTINCT FROM rate_valid_from
          OR (seasons->0->>'to')::date IS DISTINCT FROM rate_valid_to);
  IF bad > 0 THEN RAISE EXCEPTION '379: % converted cruise rate(s) do not carry their own price and dates — nothing is kept', bad; END IF;
END $$;
