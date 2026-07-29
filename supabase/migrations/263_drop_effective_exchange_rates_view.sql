-- ============================================================================
-- 263 — drop effective_exchange_rates: anon-readable view leaking tenant ids
-- ============================================================================
--
-- Found via Supabase's security advisor email (issues as of 2026-07-26) and
-- confirmed 2026-07-29 by an anon-key probe of every table/view in the
-- schema: `effective_exchange_rates` was the ONE relation still returning
-- rows to the public anon key after the 242–249 RLS restoration.
--
-- Why RLS didn't cover it: it is a VIEW (created in 123), and Postgres views
-- execute with the view OWNER's privileges by default — silently bypassing
-- the RLS on exchange_rates and tenant_members underneath. The RLS sweeps
-- fixed tables; this view kept the hole open.
--
-- What it leaked: exchange rates (global, harmless) BUT ALSO
-- effective_tenant_id — real tenant UUIDs joined in from tenant_members.
-- Anonymous tenant-id enumeration.
--
-- Why DROP instead of `security_invoker = on`: nothing reads it. No app
-- code, script, or other migration references the view (the currency stack
-- reads exchange_rates directly through lib/currency-service.ts). Dead
-- surface with a leak gets deleted, not repaired.

BEGIN;

DROP VIEW IF EXISTS effective_exchange_rates;

INSERT INTO schema_migrations (name)
VALUES ('263_drop_effective_exchange_rates_view.sql')
ON CONFLICT DO NOTHING;

COMMIT;

-- Post-check: the view must be gone.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'effective_exchange_rates'
  ) THEN
    RAISE EXCEPTION 'effective_exchange_rates still exists';
  END IF;
  RAISE NOTICE 'post-check OK: effective_exchange_rates dropped';
END $$;
