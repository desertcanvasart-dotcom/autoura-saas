-- ============================================================================
-- 245 — auto_set_tenant_id triggers for four tables that insert without it
-- ============================================================================
--
-- Found while checking whether "Add follow-up" was broken the same way "log a
-- call" was (migration 244). It is not one table — it is four.
--
-- Each has `tenant_id` NOT NULL with NO column default, no auto_set_tenant_id
-- trigger in any migration, and browser-side code that inserts without
-- supplying it. Confirmed against the live schema, not just the source:
--
--   clients              app/clients/new/page.tsx
--   client_followups     components/AddFollowupModal.tsx
--   itinerary_days       app/itineraries/[id]/edit/page.tsx
--   itinerary_services   app/itineraries/[id]/edit/page.tsx
--
-- Corroboration: production holds zero clients and zero itineraries, which is
-- what a broken create path looks like from the outside.
--
-- `auto_set_tenant_id()` (migration 007) resolves the caller's tenant and only
-- fires when tenant_id IS NULL, so every path that already sets it explicitly
-- is unaffected — /api/clients POST, for one, passes tenant_id from
-- requireAuth() and will simply no-op through the trigger.
--
-- WHAT THIS DOES NOT FIX: the function reads auth.uid(), so it cannot help a
-- SERVICE-ROLE insert, which has no user. That is fine for all four here —
-- every path above uses a user session, including the AI generator, which
-- passes requireAuth()'s authenticated client into createLandItineraryServices
-- rather than the admin client. A service-role writer must still set tenant_id
-- itself.
--
-- Idempotent: DROP ... IF EXISTS then CREATE reaches the same end state whether
-- or not a trigger was already added by hand outside migrations — which is
-- precisely the case that could not be observed from outside the database.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- Guard: without the function these triggers would be created and then fail on
-- every insert, which is worse than the bug being fixed.
-- --------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'auto_set_tenant_id' AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION
      'auto_set_tenant_id() is missing — it is defined in migration 007. '
      'Restore it before creating triggers that call it.';
  END IF;
END $$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients', 'client_followups', 'itinerary_days', 'itinerary_services']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_tenant_id_%I ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER set_tenant_id_%I BEFORE INSERT ON %I
         FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id()', t, t
    );
    RAISE NOTICE 'set_tenant_id_% created on %', t, t;
  END LOOP;
END $$;

-- --------------------------------------------------------------------------
-- Post-check: all four must exist before this commits.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(x.t, ', ') INTO missing
  FROM unnest(ARRAY['clients', 'client_followups', 'itinerary_days', 'itinerary_services']) AS x(t)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = x.t
      AND tg.tgname = 'set_tenant_id_' || x.t
      AND NOT tg.tgisinternal
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'trigger missing after creation on: %', missing;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Verify after applying — these are UI paths, so click them:
--   * New client        -> save            (app/clients/new)
--   * Add follow-up     -> save            (client detail)
--   * Edit an itinerary -> add a day/service and save
-- A failure would surface as 23502 "null value in column tenant_id".
--
-- A service-role insert will still report 23502 for these tables. That is
-- expected and is NOT evidence the trigger failed: the service role has no
-- auth.uid(), so get_user_tenant_id() returns NULL for it either way.
-- ============================================================================
