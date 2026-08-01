-- =====================================================================
-- 267 — Activity Summary phase 1 (docs/ACTIVITY-SUMMARY-SPEC.md)
-- =====================================================================
-- Per-user, per-day presence rollup + the tenant feature gate. One row
-- per (tenant, user, UTC day) — deliberately NOT an event log; each
-- focused heartbeat adds 5 minutes to the day's counter, so the table
-- grows by at most one row per active user per day.
--
-- RLS: users read their own rows (self-transparency is a product
-- commitment — members always see what their manager sees); tenant
-- owners/admins/managers read the tenant's rows. No INSERT/UPDATE
-- policies at all: writes go through the service role only (the
-- heartbeat route), so a client cannot inflate its own minutes.
-- =====================================================================

ALTER TABLE tenant_features
  ADD COLUMN IF NOT EXISTS activity_summary_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS user_activity_daily (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  active_minutes INT NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, user_id, day)
);

ALTER TABLE user_activity_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uad_read_own ON user_activity_daily;
CREATE POLICY uad_read_own ON user_activity_daily
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS uad_read_managers ON user_activity_daily;
CREATE POLICY uad_read_managers ON user_activity_daily
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenant_members tm
      WHERE tm.tenant_id = user_activity_daily.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin', 'manager')
    )
  );

-- Atomic upsert-increment for the heartbeat route (service role only —
-- REVOKE from authenticated so clients cannot call it directly and
-- inflate their own minutes).
CREATE OR REPLACE FUNCTION increment_activity_minutes(
  p_tenant_id UUID,
  p_user_id UUID,
  p_day DATE,
  p_minutes INT
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_activity_daily (tenant_id, user_id, day, active_minutes, first_seen_at, last_seen_at)
  VALUES (p_tenant_id, p_user_id, p_day, p_minutes, NOW(), NOW())
  ON CONFLICT (tenant_id, user_id, day) DO UPDATE
    SET active_minutes = user_activity_daily.active_minutes + p_minutes,
        last_seen_at = NOW();
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION increment_activity_minutes(UUID, UUID, DATE, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION increment_activity_minutes(UUID, UUID, DATE, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_activity_minutes(UUID, UUID, DATE, INT) TO service_role;
