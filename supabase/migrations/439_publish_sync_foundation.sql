-- ============================================
-- 439: Publish — the record-change feed and its health
-- ============================================
-- Step 1 of docs/publish/PLAN.md. Publish renders tour pages from Autoura
-- records, so a change to a product, rate, departure, the company's identity
-- or an exchange rate must reach the pages that show it. The Sawa mirror
-- taught what happens otherwise: a sync that never sends looks exactly like a
-- quiet day. So every change is written down here by the database itself —
-- whichever route, import or SQL made it — and a worker
-- (/api/cron/publish-sync) works through the list and records, per company,
-- whether it kept up.
--
--   publish_change_log   one row per change; processed_at set once the
--                        pages that depend on it were told. A row whose
--                        transaction commits late simply appears later as
--                        unprocessed — no cursor to skip past it.
--   publish_sync_health  one row per company ENROLLED in Publish. No row,
--                        nothing is logged for that company and nothing is
--                        watched: companies without a site cost nothing.
--
-- Triggers only — no column is added to any existing table:
--   tour_templates, tour_variations, tour_days, tour_day_activities,
--   tour_variation_services, variation_services, variation_pricing,
--   variation_daily_itinerary, tour_departures, tenants, exchange_rates
--                                  → publish_record_change()
-- (The variation-level tables name a variation, not a tour; the tour is
-- looked up through tour_variations — gone when the variation was deleted in
-- the same statement, in which case the change refreshes all the company's
-- tours.)
--   rate_audit_log (AFTER INSERT)  → publish_record_rate_change()
-- Rates are not triggered directly: rate_audit_log already receives a row
-- from every one of the 13 rate tables (migration 252), so one trigger on it
-- covers them all and stays covering them when the audit list grows.
--
-- A trigger here must NEVER fail the write it observes: a broken Publish feed
-- that blocked saving a hotel rate would be far worse than a missed page
-- refresh. Both functions swallow their own errors (RAISE WARNING) — and the
-- worker's lag check is what notices a feed that has gone quiet.
--
-- The table list below is mirrored by lib/publish/sync/events.ts
-- (WATCHED_TABLES); lib/__tests__/publish-sync-triggers.test.ts fails when
-- the two differ.

BEGIN;

-- ---------- health (also the enrolment list) ----------

CREATE TABLE IF NOT EXISTS public.publish_sync_health (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok', 'lagging', 'failing', 'stalled')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_event_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  lag_seconds INTEGER NOT NULL DEFAULT 0,
  -- The state last alerted on, and when — so a failure is announced once,
  -- not every five minutes, and recovery is announced exactly once.
  alerted_status TEXT,
  alerted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.publish_sync_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.publish_sync_health FROM anon, authenticated;
GRANT SELECT ON public.publish_sync_health TO authenticated;

DROP POLICY IF EXISTS "Members see their company's Publish sync health" ON public.publish_sync_health;
CREATE POLICY "Members see their company's Publish sync health" ON public.publish_sync_health
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()));

-- ---------- the change feed ----------

CREATE TABLE IF NOT EXISTS public.publish_change_log (
  id BIGSERIAL PRIMARY KEY,
  -- NULL = a global row (a shared rate or exchange rate): every enrolled
  -- company is affected.
  tenant_id UUID,
  table_name TEXT NOT NULL,
  record_id UUID,
  op TEXT NOT NULL CHECK (op IN ('INSERT', 'UPDATE', 'DELETE')),
  template_id UUID,
  changed_fields TEXT[] NOT NULL DEFAULT '{}',
  -- The row's is_active after the change, when it has one: tells "a tour was
  -- switched off" (its page must come down) from any other edit.
  is_active BOOLEAN,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  processed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE INDEX IF NOT EXISTS publish_change_log_pending
  ON public.publish_change_log (id) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS publish_change_log_processed
  ON public.publish_change_log (processed_at) WHERE processed_at IS NOT NULL;

-- Server-only: written by the triggers, read by the worker (service role).
ALTER TABLE public.publish_change_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.publish_change_log FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.publish_change_log_id_seq FROM anon, authenticated;

-- ---------- shared helpers ----------

-- The top-level keys whose values differ, ignoring bookkeeping timestamps.
CREATE OR REPLACE FUNCTION public.publish_changed_keys(old_row JSONB, new_row JSONB)
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(array_agg(k ORDER BY k), '{}')
    FROM (
      SELECT key AS k FROM jsonb_each(COALESCE(new_row, '{}'::jsonb))
      UNION
      SELECT key FROM jsonb_each(COALESCE(old_row, '{}'::jsonb))
    ) keys
   WHERE k NOT IN ('updated_at', 'created_at', 'cached_price_updated_at')
     AND (old_row -> k) IS DISTINCT FROM (new_row -> k)
$$;

-- Enrolled = has a health row. A global change matters if anyone is enrolled.
CREATE OR REPLACE FUNCTION public.publish_is_watched(p_tenant UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_tenant IS NULL THEN EXISTS (SELECT 1 FROM publish_sync_health)
    ELSE EXISTS (SELECT 1 FROM publish_sync_health WHERE tenant_id = p_tenant)
  END
$$;
REVOKE ALL ON FUNCTION public.publish_is_watched(UUID) FROM PUBLIC, anon, authenticated;

-- ---------- product, departure, identity, FX ----------

CREATE OR REPLACE FUNCTION public.publish_record_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old_j JSONB := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  new_j JSONB := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  row_j JSONB := COALESCE(new_j, old_j);
  v_tenant UUID;
  v_template UUID;
  v_fields TEXT[];
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'tenants' THEN
      v_tenant := (row_j ->> 'id')::uuid;
    ELSE
      v_tenant := (row_j ->> 'tenant_id')::uuid;
    END IF;

    IF TG_TABLE_NAME = 'tour_templates' THEN
      v_template := (row_j ->> 'id')::uuid;
    ELSIF TG_TABLE_NAME IN ('tour_variations', 'tour_days', 'tour_day_activities', 'tour_departures') THEN
      v_template := (row_j ->> 'template_id')::uuid;
    ELSIF TG_TABLE_NAME IN ('tour_variation_services', 'variation_services', 'variation_pricing', 'variation_daily_itinerary') THEN
      SELECT template_id INTO v_template FROM tour_variations WHERE id = (row_j ->> 'variation_id')::uuid;
    END IF;

    IF NOT publish_is_watched(v_tenant) THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    v_fields := publish_changed_keys(old_j, new_j);
    -- An UPDATE that changed nothing but timestamps is not a change.
    IF TG_OP = 'UPDATE' AND cardinality(v_fields) = 0 THEN
      RETURN NEW;
    END IF;

    INSERT INTO publish_change_log (tenant_id, table_name, record_id, op, template_id, changed_fields, is_active)
    VALUES (v_tenant, TG_TABLE_NAME, (row_j ->> 'id')::uuid, TG_OP, v_template, v_fields,
            CASE WHEN row_j ? 'is_active' THEN (row_j ->> 'is_active')::boolean END);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'publish_record_change on %: %', TG_TABLE_NAME, SQLERRM;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.publish_record_change() FROM PUBLIC, anon, authenticated;

-- ---------- rates, via the existing audit log ----------

CREATE OR REPLACE FUNCTION public.publish_record_rate_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fields TEXT[];
BEGIN
  BEGIN
    IF NOT publish_is_watched(NEW.tenant_id) THEN
      RETURN NEW;
    END IF;
    v_fields := publish_changed_keys(NEW.old_data, NEW.new_data);
    IF NEW.action = 'UPDATE' AND cardinality(v_fields) = 0 THEN
      RETURN NEW;
    END IF;
    INSERT INTO publish_change_log (tenant_id, table_name, record_id, op, changed_fields)
    VALUES (NEW.tenant_id, NEW.table_name, NEW.record_id, NEW.action, v_fields);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'publish_record_rate_change: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_record_rate_change() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tour_templates', 'tour_variations', 'tour_days', 'tour_day_activities',
    'tour_variation_services', 'variation_services', 'variation_pricing',
    'variation_daily_itinerary', 'tour_departures', 'tenants', 'exchange_rates'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS publish_change_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER publish_change_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.publish_record_change()', t, t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS publish_change_rate_audit_log ON public.rate_audit_log;
CREATE TRIGGER publish_change_rate_audit_log AFTER INSERT ON public.rate_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.publish_record_rate_change();

COMMIT;
