-- ============================================================================
-- 297 — trip_messages.notify_outcome: silence must be diagnosable
-- ============================================================================
--
-- P5 of docs/plans/productization-from-reference.md, porting the reference's
-- notify-outcome lesson: the inbound trip-message push was fire-and-forget,
-- so "traveller wrote, nobody was told" looked identical to "everything
-- worked". Every INBOUND trip message now records what its office
-- notification actually did:
--
--   pending         stamped nothing yet (write happened, notify in flight)
--   push_sent       web push delivered to at least one subscribed browser
--   email_sent      no usable push; fallback email to the tenant's contact
--                   address was accepted by the mail provider
--   no_recipients   channels are configured but nobody is reachable
--                   (zero push subscriptions and no contact_email)
--   not_configured  neither push (VAPID) nor email is set up at all
--   failed          delivery was attempted and every attempt failed
--
-- NULL = outbound rows and rows from before this feature.

BEGIN;

ALTER TABLE trip_messages ADD COLUMN IF NOT EXISTS notify_outcome TEXT;
ALTER TABLE trip_messages DROP CONSTRAINT IF EXISTS trip_messages_notify_outcome_check;
ALTER TABLE trip_messages ADD CONSTRAINT trip_messages_notify_outcome_check
  CHECK (notify_outcome IS NULL OR notify_outcome IN
    ('pending', 'push_sent', 'email_sent', 'no_recipients', 'not_configured', 'failed'));

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check (run after COMMIT):
--   SELECT count(*) FROM information_schema.columns
--   WHERE table_name = 'trip_messages' AND column_name = 'notify_outcome'; -- 1
--   UPDATE trip_messages SET notify_outcome = 'bogus' WHERE false;         -- ok
--   (probe with a real row: INSERT ... notify_outcome='bogus' must be rejected)
