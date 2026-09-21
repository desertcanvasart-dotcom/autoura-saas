-- ============================================
-- 377: one of each index — the last difference between this repo and production
-- ============================================
-- After 374–376 a database built from this folder and production have the
-- same tables and the same columns. Only indexes still differ, two ways.
--
-- A. FOURTEEN INDEXES PRODUCTION HAS TWICE
--    Migration 100 names the booking indexes idx_bookings_*_v2,
--    idx_passengers_*_v2 and idx_booking_payments_*_v2. Production has those —
--    and ALSO the same fourteen without the suffix, made by hand before 100
--    existed. Checked on production 2026-09-21: every pair is identical
--    (same table, same columns, same order, same WHERE), and none of the
--    spare ones backs a constraint. A second copy answers no query the first
--    does not; it is written on every booking, passenger and payment, and
--    that is all it does.
--
--    The un-suffixed copy goes, because the _v2 name is the one a migration
--    builds. Each goes ONLY if its _v2 twin is there and identical — checked
--    when this runs, not when it was written. Otherwise it stays: an index
--    too many is a small cost, an index too few is a slow page.
--
-- B. FIVE INDEXES ONLY A FRESH BUILD HAS
--    I had these down as "add them to production". Reading what would USE
--    them says the opposite:
--
--      idx_usage_current (tenant_usage: tenant_id, period_end)
--          the same index as idx_usage_tenant_period_end (…period_end DESC),
--          which both sides have — a btree reads backwards. 030_admin_billing
--          and 030_admin_billing_fixed each made their own.
--      idx_content_library_created_by, idx_writing_rules_category,
--      idx_itineraries_cost_mode, idx_itinerary_services_code
--          nothing filters, joins or sorts on any of these columns: no route,
--          no function, no policy. (The one `.eq('service_code')` in the code
--          is on activity_rates.) Production has run without them since they
--          were written.
--
--    An index no query uses is only a cost, so production is the side that
--    is right and the fresh build loses them. If a query ever needs one, it
--    arrives with that query. This half is a no-op on production.
--
-- CHANGES PRODUCTION: part A drops fourteen indexes there (all three tables
-- are empty today, so it is instant). No ordering constraint with the code —
-- nothing names an index. Idempotent.

-- ---- A. the spare copy goes, if its twin is really there ----
DO $$
DECLARE
  spare TEXT;
  spare_def TEXT;
  twin_def TEXT;
BEGIN
  FOREACH spare IN ARRAY ARRAY[
    'idx_bookings_tenant', 'idx_bookings_status', 'idx_bookings_dates', 'idx_bookings_client',
    'idx_bookings_partner', 'idx_bookings_itinerary', 'idx_bookings_booking_date',
    'idx_passengers_booking', 'idx_passengers_tenant', 'idx_passengers_lead',
    'idx_booking_payments_booking', 'idx_booking_payments_tenant',
    'idx_booking_payments_status', 'idx_booking_payments_date'
  ] LOOP
    SELECT indexdef INTO spare_def FROM pg_indexes WHERE schemaname = 'public' AND indexname = spare;
    SELECT indexdef INTO twin_def  FROM pg_indexes WHERE schemaname = 'public' AND indexname = spare || '_v2';
    CONTINUE WHEN spare_def IS NULL;

    -- Identical apart from the name: "CREATE INDEX <name> ON …" → "… ON …".
    IF twin_def IS NULL
       OR regexp_replace(spare_def, ' INDEX \S+ ON ', ' INDEX ON ')
          IS DISTINCT FROM regexp_replace(twin_def, ' INDEX \S+ ON ', ' INDEX ON ')
       OR EXISTS (SELECT 1 FROM pg_constraint WHERE conindid = to_regclass('public.' || spare))
    THEN
      RAISE NOTICE '377: keeping % — it has no identical %_v2 twin (or it backs a constraint)', spare, spare;
      CONTINUE;
    END IF;

    EXECUTE format('DROP INDEX public.%I', spare);
  END LOOP;
END $$;

-- ---- B. indexes no query uses — a no-op on production ----
DO $$
DECLARE
  item TEXT[];
BEGIN
  -- The duplicate: only if the index it duplicates is there.
  IF to_regclass('public.idx_usage_tenant_period_end') IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_usage_current' AND tablename = 'tenant_usage'
  ) THEN
    DROP INDEX public.idx_usage_current;
  END IF;

  -- The unused four. Dropped only from the table each was made on — a name
  -- is not proof of what an index is.
  FOREACH item SLICE 1 IN ARRAY ARRAY[
    ['idx_content_library_created_by', 'content_library'],
    ['idx_writing_rules_category',     'writing_rules'],
    ['idx_itineraries_cost_mode',      'itineraries'],
    ['idx_itinerary_services_code',    'itinerary_services']
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = item[1] AND tablename = item[2]) THEN
      EXECUTE format('DROP INDEX public.%I', item[1]);
    END IF;
  END LOOP;
END $$;
