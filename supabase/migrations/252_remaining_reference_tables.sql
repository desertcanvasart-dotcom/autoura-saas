-- ============================================================================
-- 252 — the audit's last three unbuilt tables
-- ============================================================================
--
-- prompt_templates, rate_audit_log, content_usage_log. Schemas derived from
-- their existing readers/writers, per the pattern that built
-- communication_history (244) and email_client_links (250).
--
-- Honest status of each, established before writing a line of SQL:
--   * prompt_templates   — a full CRUD route exists (/api/content-library/
--                          prompts) with a UI behind it. Functional immediately.
--   * rate_audit_log     — a READER exists (/api/rates/audit-log) but NOTHING
--                          ever wrote it. Building only the table would ship a
--                          permanently empty "audit log", which is worse than a
--                          missing one. So the writer is a DATABASE TRIGGER on
--                          the 13 rate tables the reader whitelists — it
--                          records every write path, including seed scripts
--                          and the service role, without touching any route.
--   * content_usage_log  — a writer exists (logContentUsage) but is itself
--                          UNCALLED today. The table completes the code's
--                          world; rows appear when that function gains a
--                          caller. Stated here so nobody mistakes empty for
--                          broken.
-- ============================================================================

BEGIN;

-- ============================================================
-- 1. prompt_templates — custom AI prompts, per tenant
-- ============================================================
-- Every column is one the route inserts/updates or the reader filters on.
-- The route runs on requireAuth()'s AUTHENTICATED client and writes tenant_id
-- explicitly, so RLS tenant policies are load-bearing here — notably the
-- route's "unset other defaults" UPDATE carries no tenant filter of its own
-- and relies on RLS to keep it inside the caller's tenant.

CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  -- The route validates against this exact list; the CHECK keeps a bypassing
  -- writer honest too.
  purpose TEXT NOT NULL CHECK (purpose IN (
    'itinerary_full', 'day_description', 'site_description',
    'transfer', 'email', 'summary', 'whatsapp'
  )),
  description TEXT,
  system_prompt TEXT,
  user_prompt_template TEXT NOT NULL,
  -- Extracted {{placeholder}} names, stored as a JSON array by the route.
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  temperature NUMERIC,
  max_tokens INTEGER NOT NULL DEFAULT 2000,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One default per purpose per tenant. The route enforces this by
-- unset-then-set, which races under concurrent writers; this makes the loser
-- fail loudly instead of leaving two defaults. Partial-unique is fine here —
-- nothing upserts against it (the 248 lesson applies to ON CONFLICT targets,
-- not integrity constraints).
CREATE UNIQUE INDEX IF NOT EXISTS uq_prompt_templates_default
  ON prompt_templates (tenant_id, purpose)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_prompt_templates_tenant_purpose
  ON prompt_templates (tenant_id, purpose);

ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prompt_templates_tenant ON prompt_templates;
CREATE POLICY prompt_templates_tenant ON prompt_templates
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS prompt_templates_service_role ON prompt_templates;
CREATE POLICY prompt_templates_service_role ON prompt_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 2. rate_audit_log + the trigger that actually writes it
-- ============================================================
-- Columns match the reader: it filters table_name/record_id and orders by
-- changed_at. old_data/new_data carry the row snapshots that make an audit
-- log worth reading.

CREATE TABLE IF NOT EXISTS rate_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  -- NULL for service-role writes (deploy syncs, seed scripts): auth.uid() has
  -- no value there, and "changed by the system" is the truthful record.
  changed_by UUID,
  -- Copied from the audited row so RLS can scope reads the same way the rate
  -- tables themselves are scoped. NULL = a global rate row.
  tenant_id UUID,
  old_data JSONB,
  new_data JSONB,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_audit_table_time
  ON rate_audit_log (table_name, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_audit_record
  ON rate_audit_log (record_id);

ALTER TABLE rate_audit_log ENABLE ROW LEVEL SECURITY;

-- Read-only for staff, scoped like the rate tables themselves (242): global
-- rows visible to any authenticated user, tenant rows to their tenant. No
-- INSERT/UPDATE/DELETE policies for authenticated — an audit log nobody can
-- edit from the app is the point. The trigger function below is SECURITY
-- DEFINER and owned by the migration role, so it writes regardless.
DROP POLICY IF EXISTS rate_audit_log_read ON rate_audit_log;
CREATE POLICY rate_audit_log_read ON rate_audit_log
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS rate_audit_log_service_role ON rate_audit_log;
CREATE POLICY rate_audit_log_service_role ON rate_audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION rate_audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB := to_jsonb(COALESCE(NEW, OLD));
BEGIN
  INSERT INTO rate_audit_log (table_name, record_id, action, changed_by, tenant_id, old_data, new_data)
  VALUES (
    TG_TABLE_NAME,
    (payload->>'id')::uuid,
    TG_OP,
    auth.uid(),
    (payload->>'tenant_id')::uuid,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- The same 13 tables the reader whitelists — kept in step by the post-check.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accommodation_rates', 'transportation_rates', 'guide_rates', 'meal_rates',
    'entrance_fees', 'flight_rates', 'activity_rates', 'tipping_rates',
    'airport_staff_rates', 'hotel_staff_rates', 'nile_cruises', 'train_rates',
    'sleeping_train_rates'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION rate_audit_trigger()', t, t);
  END LOOP;
END $$;

-- ============================================================
-- 3. content_usage_log — content analytics
-- ============================================================
-- Exactly what logContentUsage() inserts: content_id, variation_id,
-- itinerary_id, context. tenant_id is nullable and trigger-filled: the writer
-- does not send it, and the function may run without a user session — a
-- NOT NULL here would repeat the 23502 client-creation bug.

CREATE TABLE IF NOT EXISTS content_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES content_library(id) ON DELETE CASCADE,
  variation_id UUID REFERENCES content_variations(id) ON DELETE SET NULL,
  -- SET NULL, not CASCADE: usage statistics should survive the itinerary.
  itinerary_id UUID REFERENCES itineraries(id) ON DELETE SET NULL,
  context TEXT NOT NULL DEFAULT 'itinerary_generation',
  used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_usage_content
  ON content_usage_log (content_id, used_at DESC);

DROP TRIGGER IF EXISTS set_tenant_id_content_usage_log ON content_usage_log;
CREATE TRIGGER set_tenant_id_content_usage_log
  BEFORE INSERT ON content_usage_log
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

ALTER TABLE content_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_usage_log_tenant ON content_usage_log;
CREATE POLICY content_usage_log_tenant ON content_usage_log
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS content_usage_log_insert ON content_usage_log;
CREATE POLICY content_usage_log_insert ON content_usage_log
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS content_usage_log_service_role ON content_usage_log;
CREATE POLICY content_usage_log_service_role ON content_usage_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Post-checks
-- ============================================================
DO $$
DECLARE
  missing TEXT;
BEGIN
  -- All 13 audit triggers must exist, or the log silently under-records.
  SELECT string_agg(x.t, ', ') INTO missing
  FROM unnest(ARRAY[
    'accommodation_rates', 'transportation_rates', 'guide_rates', 'meal_rates',
    'entrance_fees', 'flight_rates', 'activity_rates', 'tipping_rates',
    'airport_staff_rates', 'hotel_staff_rates', 'nile_cruises', 'train_rates',
    'sleeping_train_rates'
  ]) AS x(t)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
    WHERE c.relname = x.t AND tg.tgname = 'audit_' || x.t AND NOT tg.tgisinternal
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'audit trigger missing on: %', missing;
  END IF;

  -- Each new table must have an authenticated path, or its feature stays dark.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prompt_templates' AND 'authenticated' = ANY(roles)) THEN
    RAISE EXCEPTION 'prompt_templates has no authenticated policy';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rate_audit_log' AND 'authenticated' = ANY(roles) AND cmd = 'SELECT') THEN
    RAISE EXCEPTION 'rate_audit_log has no authenticated SELECT policy';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Verify after applying:
--   * npm run verify:rls  — all three must stay invisible to the anonymous key
--   * Edit any rate in Rates → * , then open the audit-log view: the change
--     must appear with old and new values.
--   * Content Library → Prompts: create a template; set a second one as
--     default for the same purpose and confirm the first loses the flag.
-- ============================================================================
