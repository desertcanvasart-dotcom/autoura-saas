-- =====================================================================
-- 268 — create the notifications table that never got migrated
-- =====================================================================
-- Found verifying Activity Summary's enable-notice: every in-app
-- notification in production has been silently failing with "Could not
-- find the table 'public.notifications'". The code has expected this
-- table all along — createNotification (lib/notifications.ts) inserts
-- into it, the bell reads it, task assignment/completion notify through
-- it — and the GET route even carries an explicit "if table doesn't
-- exist, return empty results" fallback that papered over the drift
-- instead of migrating. Emails still went out (the Resend path is
-- independent); only the in-app half was dead.
--
-- Schema mirrors exactly what lib/notifications.ts writes and the API
-- routes read. Keyed by team_member_id (tenant scoping flows through
-- the directory row); no tenant_id column by design.
--
-- RLS enabled with NO policies: every reader and writer in the codebase
-- uses the service-role client (creation is a system-level act on
-- behalf of another user), so clients get no direct table access.
-- =====================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  related_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_member_created
  ON notifications (team_member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_member_unread
  ON notifications (team_member_id) WHERE is_read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
