-- ============================================================================
-- 418 — who created a task, so they hear when it is done
-- ============================================================================
--
-- Settings → Notifications offers "Task Completed — when a task you created
-- is completed", but tasks recorded no creator, so nobody could be told. A
-- task made by a person now carries their login (tasks.created_by); when it
-- is completed by someone else, its creator is notified, following their
-- Task Completed switch. Tasks generated from an itinerary have no creator.
-- Existing tasks keep NULL. Idempotent.
-- ============================================================================

BEGIN;

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS created_by UUID;

COMMIT;
