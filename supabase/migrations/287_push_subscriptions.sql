-- ============================================================================
-- 287 — push_subscriptions: where the ops PWA's alerts go
-- ============================================================================
-- One row per browser that enabled alerts on /ops. The endpoint is the
-- browser push service's URL and is unique per subscription; a dead endpoint
-- (404/410 on send) gets pruned by lib/push.ts. Tenant-scoped: any office
-- member's browser may be subscribed, and a tap on any of the tenant's trips
-- notifies all of them.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant ON push_subscriptions (tenant_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_tenant ON push_subscriptions;
CREATE POLICY push_subscriptions_tenant ON push_subscriptions
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS push_subscriptions_service_role ON push_subscriptions;
CREATE POLICY push_subscriptions_service_role ON push_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Post-check: round-trip + duplicate-endpoint refusal.
DO $$
DECLARE
  a_tenant UUID; p1 UUID := gen_random_uuid(); dup_refused BOOLEAN := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions'
                   AND policyname = 'push_subscriptions_tenant') THEN
    RAISE EXCEPTION 'tenant policy missing';
  END IF;
  SELECT id INTO a_tenant FROM tenants LIMIT 1;
  IF a_tenant IS NULL THEN
    RAISE NOTICE 'no tenant to probe with — structure asserted only';
  ELSE
    INSERT INTO push_subscriptions (id, tenant_id, endpoint, p256dh, auth)
    VALUES (p1, a_tenant, 'https://zz-probe.example/' || p1::text, 'zz', 'zz');
    BEGIN
      INSERT INTO push_subscriptions (tenant_id, endpoint, p256dh, auth)
      VALUES (a_tenant, 'https://zz-probe.example/' || p1::text, 'zz', 'zz');
    EXCEPTION WHEN unique_violation THEN dup_refused := true;
    END;
    DELETE FROM push_subscriptions WHERE id = p1;
    IF NOT dup_refused THEN
      RAISE EXCEPTION 'duplicate endpoint was accepted';
    END IF;
    RAISE NOTICE 'probe: round-trip ok, duplicate endpoint refused';
  END IF;
END $$;

COMMIT;
