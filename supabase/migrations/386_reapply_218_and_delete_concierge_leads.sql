-- ============================================================================
-- 386 — Migration 218's policies, for real this time; and deleting a lead
-- ============================================================================
-- Operator, 2026-09-24: Concierge Leads' "Archive" does nothing — the lead
-- stays in Needs Review.
--
-- 218_fix_rls_write_policies is RECORDED as applied on production
-- (schema_migrations, 2026-07-16) but NONE of its ten policies exist there —
-- it was marked done without running. So concierge_briefs still has no
-- UPDATE policy for tenant users: every triage PATCH (Start review, Mark
-- responded, Archive) updated zero rows, the route answered 404, and the
-- page ignored it. And fixed_daily_costs / departments still carry the old
-- FOR ALL policy that lets a tenant write a tenant_id NULL ("global") row
-- every other tenant reads — the other bug 218 existed to close.
--
-- This re-applies 218 verbatim, idempotently (DROP IF EXISTS before each
-- CREATE, so it is correct whether or not 218 ever ran), and adds the one
-- new policy: a tenant may DELETE its own concierge brief (the API allows it
-- only for an ARCHIVED lead, manager and above). Revisions cascade; linked
-- communication threads are kept, unlinked (ON DELETE SET NULL).

-- =====================================================
-- 1. fixed_daily_costs
-- =====================================================
DROP POLICY IF EXISTS fixed_daily_costs_tenant_isolation ON fixed_daily_costs;

DROP POLICY IF EXISTS fixed_daily_costs_tenant_read ON fixed_daily_costs;
CREATE POLICY fixed_daily_costs_tenant_read ON fixed_daily_costs
  FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS fixed_daily_costs_tenant_insert ON fixed_daily_costs;
CREATE POLICY fixed_daily_costs_tenant_insert ON fixed_daily_costs
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS fixed_daily_costs_tenant_update ON fixed_daily_costs;
CREATE POLICY fixed_daily_costs_tenant_update ON fixed_daily_costs
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS fixed_daily_costs_tenant_delete ON fixed_daily_costs;
CREATE POLICY fixed_daily_costs_tenant_delete ON fixed_daily_costs
  FOR DELETE
  USING (tenant_id = get_user_tenant_id());

-- =====================================================
-- 2. departments
-- =====================================================
DROP POLICY IF EXISTS departments_tenant_isolation ON departments;

DROP POLICY IF EXISTS departments_tenant_read ON departments;
CREATE POLICY departments_tenant_read ON departments
  FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS departments_tenant_insert ON departments;
CREATE POLICY departments_tenant_insert ON departments
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS departments_tenant_update ON departments;
CREATE POLICY departments_tenant_update ON departments
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS departments_tenant_delete ON departments;
CREATE POLICY departments_tenant_delete ON departments
  FOR DELETE
  USING (tenant_id = get_user_tenant_id());

-- =====================================================
-- 3. concierge_briefs / concierge_brief_revisions
--    Add the missing tenant write policies (triage PATCH runs via RLS).
--    Global (tenant_id NULL) briefs stay read-only to tenants.
-- =====================================================
DROP POLICY IF EXISTS concierge_briefs_tenant_update ON concierge_briefs;
CREATE POLICY concierge_briefs_tenant_update ON concierge_briefs
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS concierge_revisions_tenant_update ON concierge_brief_revisions;
CREATE POLICY concierge_revisions_tenant_update ON concierge_brief_revisions
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

-- =====================================================
-- 4. concierge_briefs — a tenant deletes its own (archived) leads
-- =====================================================
DROP POLICY IF EXISTS concierge_briefs_tenant_delete ON concierge_briefs;
CREATE POLICY concierge_briefs_tenant_delete ON concierge_briefs
  FOR DELETE
  USING (tenant_id = get_user_tenant_id());
