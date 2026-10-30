-- ============================================
-- 441: when a tour departs, and what cancelling costs — as records
-- ============================================
-- docs/publish/PLAN.md D8 / E4 (approved 2026-10-25). A Publish tour page
-- shows departure days and cancellation terms, and both are promises a
-- customer can hold the agency to. Neither existed as a record: departure
-- days only for Nile cruises (nile_cruises.sailing_days, migration 382), and
-- cancellation wording only inside message templates and bookings. So they
-- become records the operator owns — never text Publish writes.
--
--   tour_templates.departure_days     the weekdays a tour runs, same shape as
--                                     sailing_days; empty = not stated (the
--                                     page then shows no departure days —
--                                     never "daily" by default)
--   cancellation_policies             the company's terms: charge tiers
--                                     (days before departure → % charged) and
--                                     optional wording per language; one is
--                                     the company default
--   tour_templates.cancellation_policy_id
--                                     a tour's own terms, when not the default
--
-- Both are watched by the Publish change feed (migration 439), so a changed
-- policy or departure day refreshes the pages that show it.

BEGIN;

-- ---------- departure days ----------

ALTER TABLE public.tour_templates
  ADD COLUMN IF NOT EXISTS departure_days TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.tour_templates.departure_days IS
  'Weekdays the tour departs (mon..sun). Empty = not stated: nothing is shown, never "daily" by default (migration 441).';

ALTER TABLE public.tour_templates DROP CONSTRAINT IF EXISTS tour_templates_departure_days_keys;
ALTER TABLE public.tour_templates ADD CONSTRAINT tour_templates_departure_days_keys
  CHECK (departure_days <@ ARRAY['mon','tue','wed','thu','fri','sat','sun']::text[]);

-- ---------- cancellation policies ----------

CREATE TABLE IF NOT EXISTS public.cancellation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  is_default BOOLEAN NOT NULL DEFAULT false,
  -- [{ "days_before": 30, "charge_percent": 25 }, …]: a cancellation made
  -- N days or fewer before departure is charged this share of the price
  -- (the tier with the smallest N that is still >= the days left applies).
  -- Earlier than the largest N is not stated by the policy — a page says
  -- nothing about it rather than calling it free. Checked below.
  tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Optional wording in the agency's own words, per language: { "en": "…" }.
  wording JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cancellation_policies_tiers_array CHECK (jsonb_typeof(tiers) = 'array'),
  CONSTRAINT cancellation_policies_wording_object CHECK (jsonb_typeof(wording) = 'object')
);
CREATE UNIQUE INDEX IF NOT EXISTS cancellation_policies_one_default
  ON public.cancellation_policies (tenant_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS cancellation_policies_tenant ON public.cancellation_policies (tenant_id);

-- Every tier is a whole number of days (0–365) and a percentage (0–100).
CREATE OR REPLACE FUNCTION public.cancellation_tiers_valid(t JSONB)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(t) = 'array' AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(t) e
     WHERE jsonb_typeof(e) <> 'object'
        OR jsonb_typeof(e -> 'days_before') <> 'number'
        OR jsonb_typeof(e -> 'charge_percent') <> 'number'
        OR (e ->> 'days_before')::numeric NOT BETWEEN 0 AND 365
        OR (e ->> 'days_before')::numeric <> trunc((e ->> 'days_before')::numeric)
        OR (e ->> 'charge_percent')::numeric NOT BETWEEN 0 AND 100
  )
$$;
ALTER TABLE public.cancellation_policies DROP CONSTRAINT IF EXISTS cancellation_policies_tiers_valid;
ALTER TABLE public.cancellation_policies ADD CONSTRAINT cancellation_policies_tiers_valid
  CHECK (public.cancellation_tiers_valid(tiers));

DROP TRIGGER IF EXISTS cancellation_policies_updated_at ON public.cancellation_policies;
CREATE TRIGGER cancellation_policies_updated_at BEFORE UPDATE ON public.cancellation_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tour_templates
  ADD COLUMN IF NOT EXISTS cancellation_policy_id UUID REFERENCES public.cancellation_policies(id) ON DELETE SET NULL;

-- A tour's own policy must be its own company's.
CREATE OR REPLACE FUNCTION public.tour_policy_same_company()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.cancellation_policy_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.cancellation_policy_id IS DISTINCT FROM OLD.cancellation_policy_id)
     AND NOT EXISTS (SELECT 1 FROM cancellation_policies WHERE id = NEW.cancellation_policy_id AND tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'cancellation_policy_id belongs to another company' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tour_policy_same_company() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tour_templates_policy_same_company ON public.tour_templates;
CREATE TRIGGER tour_templates_policy_same_company BEFORE INSERT OR UPDATE OF cancellation_policy_id ON public.tour_templates
  FOR EACH ROW EXECUTE FUNCTION public.tour_policy_same_company();

-- RLS: the company reads; members who may write manage (migration 424's rule).
ALTER TABLE public.cancellation_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cancellation_policies FROM anon;
DROP POLICY IF EXISTS "Members read" ON public.cancellation_policies;
DROP POLICY IF EXISTS "Writers write" ON public.cancellation_policies;
CREATE POLICY "Members read" ON public.cancellation_policies FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()));
CREATE POLICY "Writers write" ON public.cancellation_policies FOR ALL TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()) AND public.member_can_write(tenant_id))
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()) AND public.member_can_write(tenant_id));

-- ---------- the Publish change feed watches the policies ----------

DROP TRIGGER IF EXISTS publish_change_cancellation_policies ON public.cancellation_policies;
CREATE TRIGGER publish_change_cancellation_policies AFTER INSERT OR UPDATE OR DELETE ON public.cancellation_policies
  FOR EACH ROW EXECUTE FUNCTION public.publish_record_change();

COMMIT;
