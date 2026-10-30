-- ============================================
-- 454: service lines in the supplier's OWN currency
-- ============================================
-- Ported from PR #692 (its migration 439, written for the old
-- one-row-per-supplier-per-day shape) onto the per-line service bookings of
-- 446. booking_supplier_status.cost_currency (added in 446, never written
-- until now) is the currency quoted_cost and confirmed_cost are in; NULL =
-- the booking's. A line built from an itinerary service now carries the
-- supplier's own currency and amount when the service was priced in one
-- foreign currency with the rate it was converted at
-- (lib/supplier-own-currency): a guide paid EGP 3,000 on a yen trip is owed
-- EGP 3,000, not "¥14,xxx" — and the expense is recorded in EGP.
--
-- Backfill, by the same rule, ONLY for lines nobody has settled: cost_currency
-- NULL, no confirmed cost, still To arrange / Requested / Declined / No reply,
-- and quoted_cost still exactly the service's total_cost (nothing edited
-- since). Accepted lines, confirmed costs and every expense keep their
-- amounts and currencies. supplier_cost_original is PER UNIT
-- (lib/itinerary-fx): the line's own cost is original × quantity while that
-- still agrees with total_cost at exchange_rate_used, else
-- total_cost ÷ exchange_rate_used. Production had 4 candidate lines.

BEGIN;

WITH lines AS (
  SELECT r.id,
         upper(btrim(i.currency)) AS trip,
         upper(btrim(coalesce(s.supplier_currency, ''))) AS cur,
         s.supplier_cost_original AS original,
         CASE WHEN s.quantity > 0 THEN s.quantity ELSE 1 END AS qty,
         s.exchange_rate_used AS rate,
         s.total_cost AS total,
         r.quoted_cost
    FROM public.booking_supplier_status r
    JOIN public.itinerary_services s ON s.id = r.itinerary_service_id
    JOIN public.bookings b ON b.id = r.booking_id
    JOIN public.itineraries i ON i.id = b.itinerary_id
   WHERE r.cost_currency IS NULL
     AND r.confirmed_cost IS NULL
     AND r.status IN ('pending', 'requested', 'declined', 'expired')
     AND nullif(btrim(i.currency), '') IS NOT NULL
),
own AS (
  SELECT id, cur,
         CASE
           WHEN rate IS NULL OR rate <= 0 OR total IS NULL THEN NULL
           -- the stored original still agrees with the total: rounding, not an edit
           WHEN original IS NOT NULL
                AND abs(original * rate * qty - total) <= greatest(0.01, abs(total) * 0.005)
             THEN round(original * qty, 2)
           -- edited since: the conversion run backwards
           ELSE round(total / rate, 2)
         END AS own_cost
    FROM lines
   WHERE cur <> '' AND cur <> trip
     -- the line is still exactly what its service made it
     AND quoted_cost IS NOT NULL AND total IS NOT NULL
     AND abs(quoted_cost - round(total, 2)) <= 0.01
)
UPDATE public.booking_supplier_status r
   SET cost_currency = o.cur,
       quoted_cost = o.own_cost,
       updated_at = NOW()
  FROM own o
 WHERE r.id = o.id
   AND o.own_cost IS NOT NULL AND o.own_cost > 0
   AND r.cost_currency IS NULL
   AND r.confirmed_cost IS NULL;

COMMIT;
