-- ============================================================================
-- 405 — A grid day remembers the day block it was built from
-- ============================================================================
-- The pricing grid lays the agency's day blocks (398) onto days — by hand,
-- by the shorthand in the pasted text, or by the AI match. Which block a day
-- came from lived only in the page's memory: after a reload, or on another
-- device, every day looked new, and every day offered "Use a block" — also
-- the ones already built from the catalog (operator, 2026-10-10).
--
-- block_code is the block's code (day_blocks.code, unique per tenant), kept
-- as text and not a foreign key: a block renamed or deleted later must not
-- break a saved quote, and the grid shows a code it no longer finds as
-- "not in your catalog". NULL = not built from a block.
--
-- save_pricing_grid_days() is 391's function with block_code added; an older
-- app that never sends the key stores NULL, exactly as before.

BEGIN;

ALTER TABLE public.itinerary_days
  ADD COLUMN IF NOT EXISTS block_code text;

-- p_days: as in 391, plus block_code per day.
CREATE OR REPLACE FUNCTION public.save_pricing_grid_days(p_itinerary_id uuid, p_days jsonb)
RETURNS TABLE(days_inserted integer, services_inserted integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
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
      );
      v_services := v_services + 1;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_days, v_services;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_pricing_grid_days(uuid, jsonb) TO authenticated;

COMMIT;
