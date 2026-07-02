-- =====================================================
-- Migration 218: Fix RLS write policies
-- =====================================================
-- Three policy bugs from the 2026-07-02 audit:
--
-- 1. fixed_daily_costs (mig 211) and departments (mig 214) use a single
--    `FOR ALL USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id())`.
--    With FOR ALL and no separate WITH CHECK, that USING expression also
--    governs INSERT/UPDATE — so any tenant can WRITE a row with tenant_id
--    NULL (a "global" row every other tenant then reads). Global seed rows
--    must be readable but immutable to tenants.
--
-- 2. concierge_briefs / concierge_brief_revisions (mig 215) only have a
--    FOR SELECT policy for tenant users. The triage PATCH runs through the
--    RLS client, so with no UPDATE policy it silently updates zero rows.
--
-- Fix: reads stay tenant-or-global; writes are constrained to the caller's
-- own tenant (WITH CHECK tenant_id = get_user_tenant_id(), never NULL).
-- The existing service_role FOR ALL policies (used for seeding) are kept.

-- =====================================================
-- 1. fixed_daily_costs
-- =====================================================
DROP POLICY IF EXISTS fixed_daily_costs_tenant_isolation ON fixed_daily_costs;

CREATE POLICY fixed_daily_costs_tenant_read ON fixed_daily_costs
  FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());

CREATE POLICY fixed_daily_costs_tenant_insert ON fixed_daily_costs
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY fixed_daily_costs_tenant_update ON fixed_daily_costs
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY fixed_daily_costs_tenant_delete ON fixed_daily_costs
  FOR DELETE
  USING (tenant_id = get_user_tenant_id());

-- =====================================================
-- 2. departments
-- =====================================================
DROP POLICY IF EXISTS departments_tenant_isolation ON departments;

CREATE POLICY departments_tenant_read ON departments
  FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());

CREATE POLICY departments_tenant_insert ON departments
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY departments_tenant_update ON departments
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

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
