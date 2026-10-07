-- ============================================================================
-- 397 — "Needs attention", dismissed
-- ============================================================================
--
-- The dashboard's Needs attention panel (lib/dashboard/attention.ts) is built
-- fresh on every load from the state of bookings and conversations. Until now
-- there was no way to say "seen it, handled elsewhere" — an automated sender
-- the robot filter missed, a reply sent from a personal phone, a balance being
-- chased by hand — so the same rows sat at the top of the dashboard for weeks
-- and buried the ones that were new.
--
-- One row per dismissed item per tenant. The item is named by a stable key
-- (kind + the record it is about) and remembered together with a FINGERPRINT
-- of the state it was dismissed in. The panel hides an item only while both
-- still match: when the situation changes — the customer writes again, the
-- balance or its deadline moves, another traveller's details come in — the
-- item comes back, because that is new news.
--
-- Tenant-wide, not per user: the panel is the office's shared to-do list.
-- Additive and replay-safe.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.dashboard_attention_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_key text NOT NULL,
  fingerprint text NOT NULL,
  dismissed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, item_key)
);

ALTER TABLE public.dashboard_attention_dismissals ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_tenant_id_dashboard_attention_dismissals ON public.dashboard_attention_dismissals;
CREATE TRIGGER set_tenant_id_dashboard_attention_dismissals
  BEFORE INSERT ON public.dashboard_attention_dismissals
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

-- The four-policy pattern (docs/ARCHITECTURE.md).
DROP POLICY IF EXISTS dashboard_attention_dismissals_select ON public.dashboard_attention_dismissals;
CREATE POLICY dashboard_attention_dismissals_select ON public.dashboard_attention_dismissals
  FOR SELECT USING (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS dashboard_attention_dismissals_insert ON public.dashboard_attention_dismissals;
CREATE POLICY dashboard_attention_dismissals_insert ON public.dashboard_attention_dismissals
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS dashboard_attention_dismissals_update ON public.dashboard_attention_dismissals;
CREATE POLICY dashboard_attention_dismissals_update ON public.dashboard_attention_dismissals
  FOR UPDATE USING (tenant_id = get_user_tenant_id()) WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS dashboard_attention_dismissals_delete ON public.dashboard_attention_dismissals;
CREATE POLICY dashboard_attention_dismissals_delete ON public.dashboard_attention_dismissals
  FOR DELETE USING (tenant_id = get_user_tenant_id());

COMMIT;
