-- ============================================================================
-- 384 — A notification can be addressed to a login, not only a staff record
-- ============================================================================
-- Operator, 2026-09-24: the sidebar now counts unread email, "however
-- notification still showing nothing" — the bell never mentions new mail.
--
-- Two reasons. Nothing created a notification when mail arrived. And the bell
-- could not have shown one anyway: notifications are keyed by team_member_id,
-- found by matching the login's email against the staff directory
-- (team_members), and on 2026-09-24 NONE of the five Gmail-connected logins
-- had a matching staff row. The table had never held a single row.
--
-- A new email is addressed to a login (whose Gmail it is), not to a directory
-- entry, so a notification may now name its user_id directly. The bell reads
-- both: rows for the login, and rows for the login's staff record if any.
--
-- dedupe_key makes "notify once per thing" a database guarantee, not a hope:
-- two open tabs polling the same inbox at the same moment insert the same
-- (user_id, dedupe_key) and one of them loses. A plain (not partial) unique
-- index, so ON CONFLICT can name it; NULL keys never collide, so every
-- existing kind of notification is unaffected.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

ALTER TABLE public.notifications
  ALTER COLUMN team_member_id DROP NOT NULL;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_has_recipient;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_has_recipient
  CHECK (team_member_id IS NOT NULL OR user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_dedupe
  ON public.notifications (user_id, dedupe_key);

COMMENT ON COLUMN public.notifications.user_id IS
  'The login this is for, when it is not (only) a staff-directory matter — e.g. new mail in that login''s Gmail. The bell shows rows for the login OR its team_members row.';
COMMENT ON COLUMN public.notifications.dedupe_key IS
  'Notify-once key per user, e.g. gmail:<message id>. Unique with user_id.';
