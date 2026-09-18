-- ============================================
-- 369: a row that NAMES a supplier is linked to it
-- ============================================
-- Reported from the live app on 2026-09-18: the Hotels page listed eleven
-- hotels with their companies above a card reading "Linked to Company 0".
-- Both were true. The rows carried supplier_NAME and no supplier_id, so the
-- company filter (which matches on the id) found none of them, and the
-- property link — which hangs off the supplier — could not resolve either.
-- 57 rows were in that state across hotels, activities and meals.
--
-- The import that produced them now resolves the name (see
-- lib/rates/link-supplier-by-name.ts), but an import is one door. A rate can
-- also arrive from a form, an API call, the AI generator, a seed, or a hand
-- written statement, and every one of those doors could write a name with no
-- link. So the rule belongs to the database, where every door passes:
--
--   naming a supplier this workspace knows IS linking to it.
--
-- Exactly one supplier with that name is a link. None, or several, is a
-- question only a human can answer: the row keeps its name, stays unlinked,
-- and the screens that count links keep telling the truth. Nothing here
-- invents a supplier.

-- Supports the per-row lookup the trigger does on every write.
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_lower_name
  ON public.suppliers (tenant_id, lower(btrim(name)));

CREATE OR REPLACE FUNCTION public.link_supplier_by_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  -- array_agg, not min(): Postgres has no min(uuid).
  matches uuid[];
BEGIN
  -- A stated link always wins — a name may never move a row to a different
  -- company. Only a name it left blank is filled in.
  IF NEW.supplier_id IS NOT NULL THEN
    IF COALESCE(btrim(NEW.supplier_name), '') = '' THEN
      SELECT s.name INTO NEW.supplier_name FROM public.suppliers s WHERE s.id = NEW.supplier_id;
    END IF;
    RETURN NEW;
  END IF;

  IF COALESCE(btrim(NEW.supplier_name), '') = '' THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(s.id) INTO matches
  FROM public.suppliers s
  WHERE s.tenant_id = NEW.tenant_id
    AND lower(btrim(s.name)) = lower(btrim(NEW.supplier_name));

  IF coalesce(array_length(matches, 1), 0) = 1 THEN
    NEW.supplier_id := matches[1];
  END IF;

  RETURN NEW;
END;
$$;

-- Every table that can name a supplier. The trigger fires only when one of
-- the two columns is written, so ordinary updates cost nothing.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accommodation_rates',
    'activity_rates',
    'airport_staff_rates',
    'booking_supplier_status',
    'expenses',
    'flight_rates',
    'hotel_staff_rates',
    'itinerary_services',
    'meal_rates',
    'nile_cruises',
    'supplier_documents',
    'supplier_invoices'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS link_supplier_by_name ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER link_supplier_by_name
           BEFORE INSERT OR UPDATE OF supplier_id, supplier_name ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.link_supplier_by_name()', t);
    END IF;
  END LOOP;
END $$;

-- The rows already in that state. The same rule, applied once: link only
-- where exactly one supplier in the same workspace carries that name. A name
-- matching none, or two, is deliberately left alone for a human.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accommodation_rates',
    'activity_rates',
    'airport_staff_rates',
    'booking_supplier_status',
    'expenses',
    'flight_rates',
    'hotel_staff_rates',
    'itinerary_services',
    'meal_rates',
    'nile_cruises',
    'supplier_documents',
    'supplier_invoices'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format($q$
        UPDATE public.%I r
           SET supplier_id = m.id
          FROM (
            SELECT s.tenant_id, lower(btrim(s.name)) AS nm, (array_agg(s.id))[1] AS id
              FROM public.suppliers s
             GROUP BY s.tenant_id, lower(btrim(s.name))
            HAVING count(*) = 1
          ) m
         WHERE r.supplier_id IS NULL
           AND COALESCE(btrim(r.supplier_name), '') <> ''
           AND m.tenant_id = r.tenant_id
           AND m.nm = lower(btrim(r.supplier_name))
      $q$, t);
    END IF;
  END LOOP;
END $$;
