-- ============================================================================
-- 455 — The grid records what the supplier is paid, in their own currency
-- ============================================================================
-- Rate sheets are kept in the supplier's currency (rate_currency: EGP for a
-- guide, USD for a Nile cruise) and converted to the agency's run currency
-- when the grid prices. The saved line kept only the converted figure:
-- supplier_currency stayed at its column default, supplier_cost_original and
-- exchange_rate_used were never written (0 of 174 live lines on 2026-10-30).
-- So the FX reprice skipped every line, and a booking's service line could
-- never be costed in what the supplier is paid (lib/supplier-own-currency,
-- migration 454).
--
-- save_pricing_grid_days() is 405's function; each service may now carry
-- supplier_currency / supplier_cost_original (PER UNIT) / exchange_rate_used
-- (trip currency per unit), filled by the app from the line's pinned rate row
-- (lib/pricing/line-supplier-currency). A service without them is saved
-- exactly as before.

BEGIN;

CREATE OR REPLACE FUNCTION public.save_pricing_grid_days(p_itinerary_id uuid, p_days jsonb)
RETURNS TABLE(days_inserted integer, services_inserted integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_svc_id uuid;
  v_tenant uuid;
  v_day jsonb;
  v_svc jsonb;
  v_day_id uuid;
  v_days integer := 0;
  v_services integer := 0;
BEGIN
  -- Visible to the caller only if RLS lets them see it (their own company).
  SELECT tenant_id INTO v_tenant FROM itineraries WHERE id = p_itinerary_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'itinerary % not found', p_itinerary_id USING ERRCODE = 'no_data_found';
  END IF;

  -- Services go with their day (ON DELETE CASCADE).
  DELETE FROM itinerary_days WHERE itinerary_id = p_itinerary_id;

  FOR v_day IN SELECT * FROM jsonb_array_elements(COALESCE(p_days, '[]'::jsonb))
  LOOP
    INSERT INTO itinerary_days (
      tenant_id, itinerary_id, day_number, date, title, description, city, overnight_city,
      day_type, overnight, has_sightseeing, airport_arrival, airport_departure,
      hotel_check_in, hotel_check_out, intercity, block_code
    ) VALUES (
      v_tenant,
      p_itinerary_id,
      (v_day->>'day_number')::integer,
      NULLIF(v_day->>'date', '')::date,
      v_day->>'title',
      v_day->>'description',
      v_day->>'city',
      v_day->>'overnight_city',
      COALESCE(NULLIF(v_day->>'day_type', ''), 'tour'),
      (v_day->>'overnight')::boolean,
      (v_day->>'has_sightseeing')::boolean,
      (v_day->>'airport_arrival')::boolean,
      (v_day->>'airport_departure')::boolean,
      (v_day->>'hotel_check_in')::boolean,
      (v_day->>'hotel_check_out')::boolean,
      NULLIF(v_day->>'intercity', ''),
      NULLIF(v_day->>'block_code', '')
    )
    RETURNING id INTO v_day_id;
    v_days := v_days + 1;

    FOR v_svc IN SELECT * FROM jsonb_array_elements(COALESCE(v_day->'services', '[]'::jsonb))
    LOOP
      INSERT INTO itinerary_services (
        tenant_id, itinerary_id, day_id, itinerary_day_id,
        service_type, service_name, description,
        quantity, unit_cost, total_cost, is_included,
        -- No default: an unset client_price means cost x the itinerary's margin (385).
        client_price,
        rate_table, rate_id
      ) VALUES (
        v_tenant, p_itinerary_id, v_day_id, v_day_id,
        v_svc->>'service_type',
        v_svc->>'service_name',
        v_svc->>'description',
        (v_svc->>'quantity')::numeric,
        (v_svc->>'unit_cost')::numeric,
        (v_svc->>'total_cost')::numeric,
        COALESCE((v_svc->>'is_included')::boolean, true),
        NULL,
        NULLIF(v_svc->>'rate_table', ''),
        NULLIF(v_svc->>'rate_id', '')::uuid
      )
      RETURNING id INTO v_svc_id;
      -- What the supplier is paid, in their own currency (455). Only when the
      -- app sent it: a line without it keeps the columns' defaults, as before.
      IF NULLIF(v_svc->>'supplier_currency', '') IS NOT NULL THEN
        UPDATE itinerary_services
           SET supplier_currency = v_svc->>'supplier_currency',
               supplier_cost_original = NULLIF(v_svc->>'supplier_cost_original', '')::numeric,
               exchange_rate_used = NULLIF(v_svc->>'exchange_rate_used', '')::numeric
         WHERE id = v_svc_id;
      END IF;
      v_services := v_services + 1;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_days, v_services;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_pricing_grid_days(uuid, jsonb) TO authenticated;

COMMIT;
