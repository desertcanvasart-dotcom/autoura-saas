-- ============================================
-- 439: booking supplier rows — the currency their cost is in
-- ============================================
-- booking_supplier_status.quoted_cost was copied from the itinerary lines'
-- total_cost (the trip's currency), and the expense made when the row is
-- confirmed was recorded in the booking's currency. So a guide paid
-- EGP 3,000 on a yen trip became an expense of "¥14,xxx", and a Nile cruise
-- contracted in USD one in EUR.
--
--   cost_currency  the currency quoted_cost and confirmed_cost are in; NULL =
--                  the booking's currency (every row before this column, and
--                  rows added by hand in the booking's currency)
--
-- The app now writes the supplier's OWN currency and amount when every line
-- of the row is in that one foreign currency with the rate it was converted
-- at (lib/supplier-own-currency); otherwise the trip's currency and
-- total_cost. Here supplier_cost_original is PER UNIT (lib/itinerary-fx), so
-- a line's own cost is original × quantity while that still agrees with
-- total_cost at exchange_rate_used, else total_cost ÷ exchange_rate_used.
--
-- Backfill, by the same rule, ONLY for rows nobody has confirmed a cost on:
-- status pending / contacted / no_response and confirmed_cost NULL. A row's
-- lines are its booking's itinerary services of the same supplier
-- (supplier_id, else name), supplier type and service date, as
-- lib/bookings/booking-suppliers groups them; the row is changed only when
-- its quoted_cost is still exactly those lines' total_cost (it came from them
-- and nothing was edited since). Confirmed rows, and every expense, keep
-- their amounts and currencies.
--
-- Replay-safe: ADD COLUMN IF NOT EXISTS behind to_regclass / column checks;
-- the backfill only touches rows whose cost_currency is still NULL.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.has_col(t text, c text) RETURNS boolean
  LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = t AND column_name = c)
$$;

-- lib/bookings/booking-suppliers supplierTypeFor (+ the grid's cruise tag):
-- NULL = nobody confirms it.
CREATE OR REPLACE FUNCTION pg_temp.supplier_type_for(st text, descr text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN coalesce(descr, '') LIKE '[pricing-grid:cruise]%' THEN 'cruise'
    ELSE CASE lower(coalesce(st, ''))
      WHEN 'hotel' THEN 'hotel' WHEN 'accommodation' THEN 'hotel'
      WHEN 'guide' THEN 'guide' WHEN 'tour_guide' THEN 'guide'
      WHEN 'transport' THEN 'transport' WHEN 'transportation' THEN 'transport' WHEN 'transfer' THEN 'transport'
      WHEN 'vehicle' THEN 'transport' WHEN 'train' THEN 'transport' WHEN 'sleeping_train' THEN 'transport'
      WHEN 'restaurant' THEN 'restaurant' WHEN 'meal' THEN 'restaurant' WHEN 'lunch' THEN 'restaurant'
      WHEN 'dinner' THEN 'restaurant' WHEN 'breakfast' THEN 'restaurant'
      WHEN 'activity' THEN 'activity' WHEN 'excursion' THEN 'activity' WHEN 'tour' THEN 'activity'
      WHEN 'entrance' THEN 'entrance' WHEN 'entrance_fee' THEN 'entrance' WHEN 'ticket' THEN 'entrance'
      WHEN 'cruise' THEN 'cruise' WHEN 'nile_cruise' THEN 'cruise'
      WHEN 'flight' THEN 'flight' WHEN 'domestic_flight' THEN 'flight'
      ELSE NULL
    END
  END
$$;

DO $$
BEGIN
  IF to_regclass('public.booking_supplier_status') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.booking_supplier_status
    ADD COLUMN IF NOT EXISTS cost_currency text;

  COMMENT ON COLUMN public.booking_supplier_status.cost_currency IS
    'Currency of quoted_cost and confirmed_cost (the supplier''s own when its itinerary lines were priced in it); NULL = the booking''s currency.';

  IF to_regclass('public.bookings') IS NULL
     OR to_regclass('public.itineraries') IS NULL
     OR to_regclass('public.itinerary_days') IS NULL
     OR to_regclass('public.itinerary_services') IS NULL
     OR NOT pg_temp.has_col('bookings', 'itinerary_id')
     OR NOT pg_temp.has_col('bookings', 'start_date')
     OR NOT pg_temp.has_col('itineraries', 'currency')
     OR NOT pg_temp.has_col('itinerary_services', 'itinerary_day_id')
     OR NOT pg_temp.has_col('itinerary_services', 'day_id')
     OR NOT pg_temp.has_col('itinerary_services', 'quantity')
     OR NOT pg_temp.has_col('itinerary_services', 'supplier_currency')
     OR NOT pg_temp.has_col('itinerary_services', 'supplier_cost_original')
     OR NOT pg_temp.has_col('itinerary_services', 'exchange_rate_used') THEN
    RETURN;
  END IF;

  WITH lines AS (
    SELECT b.id AS booking_id,
           upper(btrim(i.currency)) AS trip_currency,
           s.supplier_id,
           lower(btrim(coalesce(nullif(s.supplier_name, ''), nullif(s.service_name, ''), 'Unknown'))) AS name_key,
           pg_temp.supplier_type_for(s.service_type, s.description) AS supplier_type,
           coalesce(d.date, b.start_date + (d.day_number - 1)) AS service_date,
           upper(btrim(coalesce(s.supplier_currency, ''))) AS cur,
           s.supplier_cost_original AS original,
           CASE WHEN s.quantity > 0 THEN s.quantity ELSE 1 END AS qty,
           s.exchange_rate_used AS rate,
           s.total_cost AS total
      FROM public.bookings b
      JOIN public.itineraries i ON i.id = b.itinerary_id
      JOIN public.itinerary_days d ON d.itinerary_id = i.id
      -- either day link (385), as the app reads it
      JOIN public.itinerary_services s ON coalesce(s.itinerary_day_id, s.day_id) = d.id
     WHERE nullif(btrim(i.currency), '') IS NOT NULL
  ),
  priced AS (
    SELECT l.*,
           CASE
             WHEN rate IS NULL OR rate <= 0 OR total IS NULL THEN NULL
             -- the stored original still agrees with the total: rounding, not an edit
             WHEN original IS NOT NULL
                  AND abs(original * rate * qty - total) <= greatest(0.01, abs(total) * 0.005)
               THEN round(original * qty, 2)
             -- edited since: the conversion run backwards
             ELSE round(total / rate, 2)
           END AS own_cost
      FROM lines l
  ),
  candidates AS (
    SELECT r.id AS row_id, r.quoted_cost,
           p.trip_currency, p.cur, p.own_cost, p.total
      FROM public.booking_supplier_status r
      JOIN priced p
        ON p.booking_id = r.booking_id
       AND p.supplier_type = r.supplier_type
       AND p.service_date IS NOT DISTINCT FROM r.service_date
       AND (CASE WHEN r.supplier_id IS NOT NULL
                 THEN p.supplier_id = r.supplier_id
                 ELSE p.supplier_id IS NULL AND p.name_key = lower(btrim(r.supplier_name)) END)
     WHERE r.cost_currency IS NULL
       AND r.confirmed_cost IS NULL
       AND coalesce(r.status, 'pending') IN ('pending', 'contacted', 'no_response')
  ),
  derived AS (
    SELECT row_id,
           min(cur) AS cur,
           round(sum(own_cost), 2) AS own_amount
      FROM candidates
     GROUP BY row_id, quoted_cost, trip_currency
    HAVING count(DISTINCT cur) = 1
       AND min(cur) <> ''
       AND min(cur) <> trip_currency
       AND bool_and(own_cost IS NOT NULL)
       -- the row is still exactly what these lines made it
       AND quoted_cost IS NOT NULL
       AND abs(quoted_cost - round(sum(coalesce(total, 0)), 2)) <= 0.01
       AND round(sum(own_cost), 2) > 0
  )
  UPDATE public.booking_supplier_status r
     SET cost_currency = dv.cur,
         quoted_cost = dv.own_amount
    FROM derived dv
   WHERE r.id = dv.row_id
     AND r.cost_currency IS NULL
     AND r.confirmed_cost IS NULL;
END
$$;

COMMIT;
