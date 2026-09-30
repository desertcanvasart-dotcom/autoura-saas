-- ============================================================================
-- 391 — The pricing grid keeps each day's settings, and saves all or nothing
-- ============================================================================
-- Two problems with saving an itinerary from the Pricing Grid:
--
-- 1. A day's settings were never stored. The grid lets the operator set each
--    day's type (arrival / tour / transfer / cruise / free / departure) and
--    override its parts — overnight, sightseeing, airport in/out, hotel
--    check-in/out, intercity (none / road / flight). The grid's reload code
--    reads them back (app/pricing-grid/page.tsx: dayData.day_type, …) and its
--    completeness gate decides what each day must price from them — but
--    itinerary_days had no such columns and the save never wrote them, so
--    every reload reset every day to the default "tour" day. The columns are
--    the ones travel-ops-pro added in 20260627; intercity is TEXT from the
--    start (travel-ops-pro cast it to boolean and could not save it at all).
--
-- 2. The save was not atomic. The route deleted all the itinerary's days,
--    then inserted days one by one and each day's services, only LOGGING an
--    error and carrying on — and still answered success. A failure part-way
--    left an itinerary missing days or services with nobody told.
--    save_pricing_grid_days() does the delete and every insert in ONE
--    transaction: any error rolls it all back and the previous days survive.
--
-- The function is SECURITY INVOKER: it runs as the caller, so the same RLS
-- policies apply as when the route wrote the rows itself. Services are not
-- deleted directly — they go with their day (ON DELETE CASCADE on both
-- day_id and itinerary_day_id), exactly as before, so no new permission is
-- needed. The tenant_id and day-link triggers (020, 385) still run per row.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The day's settings
-- ---------------------------------------------------------------------------
ALTER TABLE public.itinerary_days
  ADD COLUMN IF NOT EXISTS day_type text NOT NULL DEFAULT 'tour',
  -- NULL = "use the day type's default" (app/pricing-grid/types.ts DAY_TYPE_DEFAULTS)
  ADD COLUMN IF NOT EXISTS overnight boolean,
  ADD COLUMN IF NOT EXISTS has_sightseeing boolean,
  ADD COLUMN IF NOT EXISTS airport_arrival boolean,
  ADD COLUMN IF NOT EXISTS airport_departure boolean,
  ADD COLUMN IF NOT EXISTS hotel_check_in boolean,
  ADD COLUMN IF NOT EXISTS hotel_check_out boolean,
  ADD COLUMN IF NOT EXISTS intercity text;

ALTER TABLE public.itinerary_days DROP CONSTRAINT IF EXISTS itinerary_days_day_type_check;
ALTER TABLE public.itinerary_days ADD CONSTRAINT itinerary_days_day_type_check
  CHECK (day_type IN ('arrival', 'tour', 'transfer', 'cruise', 'free', 'departure'));

ALTER TABLE public.itinerary_days DROP CONSTRAINT IF EXISTS itinerary_days_intercity_check;
ALTER TABLE public.itinerary_days ADD CONSTRAINT itinerary_days_intercity_check
  CHECK (intercity IS NULL OR intercity IN ('none', 'road', 'flight'));

-- ---------------------------------------------------------------------------
-- 2. One transaction for the whole save
-- ---------------------------------------------------------------------------
-- p_days: [{ day_number, date, title, description, city, overnight_city,
--            day_type, overnight, has_sightseeing, airport_arrival,
--            airport_departure, hotel_check_in, hotel_check_out, intercity,
--            services: [{ service_type, service_name, description, quantity,
--                         unit_cost, total_cost, is_included,
--                         rate_table, rate_id }] }]
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
      hotel_check_in, hotel_check_out, intercity
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
      NULLIF(v_day->>'intercity', '')
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
