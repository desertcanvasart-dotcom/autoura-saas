-- ============================================================================
-- 284 — clients.total_revenue_generated: the second number nothing wrote
-- ============================================================================
--
-- Displayed on the client detail page and used as the revenue sort in
-- components/ClientFilters.tsx, written by nothing, 0 on every row. Migration
-- 280 fixed its sibling, total_bookings_count, and deliberately left this one:
-- computing it means SUMMING AMOUNTS IN DIFFERENT CURRENCIES, and doing that
-- naively is the defect the audit records as check 12.
--
-- Tenants genuinely differ — five bill in EUR, "capital travel" in USD — so
-- there is no single currency this column could be denominated in. Each
-- client's revenue is therefore summed in THEIR OWN TENANT'S currency.
--
-- ── convert_amount() ────────────────────────────────────────────────────────
-- exchange_rates holds six GLOBAL pairs (tenant_id IS NULL) and EUR is a
-- complete hub: every supported currency has a pair to and from it. So:
--
--   same currency      -> as-is
--   direct pair exists -> use it
--   otherwise          -> hop through EUR
--   no path at all     -> NULL
--
-- NULL, not 0. A revenue figure that cannot be computed must not render as
-- "this client generated nothing" — that is the same conflation between
-- "unset" and "zero" that migrations 278 and 279 were written to undo. If any
-- one of a client's bookings cannot be converted, the whole total is NULL:
-- a partial sum silently under-reports, which is worse than showing nothing.
--
-- Cancelled bookings are excluded, matching total_bookings_count.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION convert_amount(
  p_amount NUMERIC, p_from TEXT, p_to TEXT
) RETURNS NUMERIC AS $$
DECLARE
  direct NUMERIC;
  to_eur NUMERIC;
  from_eur NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_from IS NULL OR p_to IS NULL THEN RETURN NULL; END IF;
  IF p_from = p_to THEN RETURN p_amount; END IF;

  SELECT rate INTO direct FROM exchange_rates
   WHERE base_currency = p_from AND target_currency = p_to AND COALESCE(is_active, true)
   ORDER BY last_updated_at DESC NULLS LAST LIMIT 1;
  IF direct IS NOT NULL THEN RETURN p_amount * direct; END IF;

  -- Hop through EUR, the hub.
  SELECT rate INTO to_eur FROM exchange_rates
   WHERE base_currency = p_from AND target_currency = 'EUR' AND COALESCE(is_active, true)
   ORDER BY last_updated_at DESC NULLS LAST LIMIT 1;
  SELECT rate INTO from_eur FROM exchange_rates
   WHERE base_currency = 'EUR' AND target_currency = p_to AND COALESCE(is_active, true)
   ORDER BY last_updated_at DESC NULLS LAST LIMIT 1;

  IF to_eur IS NOT NULL AND from_eur IS NOT NULL THEN
    RETURN p_amount * to_eur * from_eur;
  END IF;

  RETURN NULL;   -- no path: the caller must not invent a number
END;
$$ LANGUAGE plpgsql STABLE;

-- Extend the SINGLE writer added in migration 280 rather than adding a second.
-- Two writers on one column is exactly how the sibling's booking count drifted.
CREATE OR REPLACE FUNCTION recount_client_bookings(p_client_id UUID)
RETURNS void AS $$
DECLARE
  tenant_cur TEXT;
  n_total INT;
  n_convertible INT;
  revenue NUMERIC;
BEGIN
  IF p_client_id IS NULL THEN RETURN; END IF;

  SELECT t.default_currency INTO tenant_cur
    FROM clients c JOIN tenants t ON t.id = c.tenant_id
   WHERE c.id = p_client_id;

  SELECT count(*),
         count(*) FILTER (WHERE convert_amount(b.total_amount, b.currency, tenant_cur) IS NOT NULL),
         sum(convert_amount(b.total_amount, b.currency, tenant_cur))
    INTO n_total, n_convertible, revenue
    FROM bookings b
   WHERE b.client_id = p_client_id
     AND COALESCE(b.status, '') <> 'cancelled';

  UPDATE clients
     SET total_bookings_count = COALESCE(n_total, 0),
         -- All or nothing: a partial sum under-reports silently.
         total_revenue_generated = CASE
           WHEN n_total = 0 THEN 0
           WHEN n_convertible = n_total THEN revenue
           ELSE NULL
         END
   WHERE id = p_client_id;
END;
$$ LANGUAGE plpgsql;

-- Backfill every client from the real data.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM clients LOOP
    PERFORM recount_client_bookings(c.id);
  END LOOP;
END $$;

-- --------------------------------------------------------------------------
-- Post-check: the conversion must be right in every direction, and must
-- refuse rather than guess.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  same NUMERIC; direct NUMERIC; hopped NUMERIC; nopath NUMERIC;
BEGIN
  same := convert_amount(100, 'EUR', 'EUR');
  IF same IS DISTINCT FROM 100 THEN
    RAISE EXCEPTION 'same-currency conversion returned %', same;
  END IF;

  direct := convert_amount(100, 'USD', 'EUR');
  IF direct IS NULL OR direct <= 0 THEN
    RAISE EXCEPTION 'direct USD->EUR conversion failed (got %)', direct;
  END IF;

  -- GBP->USD has no direct pair and must route through EUR.
  hopped := convert_amount(100, 'GBP', 'USD');
  IF hopped IS NULL OR hopped <= 0 THEN
    RAISE EXCEPTION 'GBP->USD should hop through EUR (got %)', hopped;
  END IF;

  nopath := convert_amount(100, 'JPY', 'USD');
  IF nopath IS NOT NULL THEN
    RAISE EXCEPTION 'an unsupported currency must return NULL, not % ', nopath;
  END IF;

  RAISE NOTICE 'convert_amount: same=%, direct=%, via-EUR=%, unsupported=NULL', same, round(direct,2), round(hopped,2);
END $$;

COMMIT;
