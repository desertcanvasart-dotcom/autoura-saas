-- ============================================================================
-- 292 — integrate the trip channel at the database layer
-- ============================================================================
--
-- Mig 291 added trip_messages but wired its conversation bookkeeping in app
-- code only. The code review caught what that leaves broken:
--
--   * update_unified_conversation_stats() (mig 125) recomputes
--     unified_conversations counters from whatsapp+email ONLY, and fires on
--     every whatsapp/email write — so the app-side trip increments were
--     silently ERASED by the next message on any other channel, and the
--     read-modify-write increments were the documented two-writer
--     lost-update pattern (total_bookings_count lesson) besides.
--   * the unified_messages view had no trip arm, so view consumers (the
--     stats function's preview/channel read included) never saw the thread.
--   * mig 291's mark-read UPDATE policy restricted no columns, so any
--     authenticated tenant user could rewrite a traveller message's content
--     or direction — defeating the insert-side direction pin.
--   * /ops needed per-trip unread counts and was fetching up to 500 raw
--     rows per poll to tally them client-side (silently truncating at 500).
--
-- This migration makes the database authoritative: view gains the trip arm,
-- the recompute counts all three channels and runs from a trip_messages
-- trigger, UPDATE is column-limited to is_read, and a grouped-count function
-- serves the ops board. The app-side counter code is deleted in the same PR.

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. unified_messages: third arm for the trip thread
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW unified_messages AS
SELECT 'whatsapp'::text AS channel,
   wm.id,
   wm.tenant_id,
   uc.id AS unified_conversation_id,
   wc.phone_number AS contact_identifier,
   wm.message_text AS content,
   NULL::text AS subject,
   wm.direction,
   wm.media_url,
   wm.media_type,
   wm.status,
   wm.sent_at AS message_at,
       CASE
           WHEN wm.status::text = 'read'::text THEN true
           ELSE false
       END AS is_read,
   wm.created_at
  FROM whatsapp_messages wm
    JOIN whatsapp_conversations wc ON wm.conversation_id = wc.id
    LEFT JOIN unified_conversations uc ON uc.whatsapp_conversation_id = wc.id
UNION ALL
SELECT 'email'::text AS channel,
   em.id,
   em.tenant_id,
   em.unified_conversation_id,
       CASE
           WHEN em.direction::text = 'inbound'::text THEN em.from_email
           ELSE em.to_email
       END AS contact_identifier,
   COALESCE(em.body_text, em.snippet) AS content,
   em.subject,
   em.direction,
   NULL::text AS media_url,
   NULL::character varying AS media_type,
       CASE
           WHEN em.is_read THEN 'read'::text
           ELSE 'delivered'::text
       END AS status,
   em.sent_at AS message_at,
   em.is_read,
   em.created_at
  FROM email_messages em
UNION ALL
SELECT 'trip'::text AS channel,
   tm.id,
   tm.tenant_id,
   tm.unified_conversation_id,
   tm.sender_name AS contact_identifier,
   tm.content,
   NULL::text AS subject,
   tm.direction,
   NULL::text AS media_url,
   NULL::character varying AS media_type,
       CASE
           WHEN tm.is_read THEN 'read'::text
           ELSE 'delivered'::text
       END AS status,
   tm.created_at AS message_at,
   tm.is_read,
   tm.created_at
  FROM trip_messages tm;

-- CREATE OR REPLACE VIEW preserves reloptions, but mig 277's hardening is
-- load-bearing (the view unions tenant tables) — re-assert rather than trust.
ALTER VIEW unified_messages SET (security_invoker = true);
REVOKE ALL ON unified_messages FROM anon;

-- ----------------------------------------------------------------------------
-- 2. Stats recompute counts all three channels
-- ----------------------------------------------------------------------------
-- Every column is table-qualified. Mig 125's file text left status/direction
-- unqualified, which is AMBIGUOUS in the three-way whatsapp join (both
-- whatsapp_conversations and unified_conversations carry status) — the live
-- function had evidently been fixed in-database (drift), and reproducing the
-- file text re-broke every whatsapp/email insert until the probe caught it.
CREATE OR REPLACE FUNCTION update_unified_conversation_stats(p_unified_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total INTEGER := 0;
  v_unread INTEGER := 0;
  v_last_at TIMESTAMPTZ;
  v_last_preview TEXT;
  v_last_channel VARCHAR(20);
BEGIN
  -- Count WhatsApp messages
  SELECT
    COUNT(*),
    SUM(CASE WHEN wm.status != 'read' AND wm.direction = 'inbound' THEN 1 ELSE 0 END),
    MAX(wm.sent_at)
  INTO v_total, v_unread, v_last_at
  FROM whatsapp_messages wm
  JOIN whatsapp_conversations wc ON wm.conversation_id = wc.id
  JOIN unified_conversations uc ON uc.whatsapp_conversation_id = wc.id
  WHERE uc.id = p_unified_id;

  -- Add email messages
  SELECT
    v_total + COUNT(*),
    v_unread + SUM(CASE WHEN NOT em.is_read AND em.direction = 'inbound' THEN 1 ELSE 0 END),
    GREATEST(v_last_at, MAX(em.sent_at))
  INTO v_total, v_unread, v_last_at
  FROM email_messages em
  WHERE em.unified_conversation_id = p_unified_id;

  -- Add trip-thread messages (mig 291/292)
  SELECT
    v_total + COUNT(*),
    v_unread + SUM(CASE WHEN NOT tm.is_read AND tm.direction = 'inbound' THEN 1 ELSE 0 END),
    GREATEST(v_last_at, MAX(tm.created_at))
  INTO v_total, v_unread, v_last_at
  FROM trip_messages tm
  WHERE tm.unified_conversation_id = p_unified_id;

  -- Get last message preview
  SELECT um.content, um.channel INTO v_last_preview, v_last_channel
  FROM unified_messages um
  WHERE um.unified_conversation_id = p_unified_id
  ORDER BY um.message_at DESC
  LIMIT 1;

  -- Update stats
  UPDATE unified_conversations
  SET
    total_messages = COALESCE(v_total, 0),
    unread_messages = COALESCE(v_unread, 0),
    last_message_at = v_last_at,
    last_message_preview = LEFT(v_last_preview, 100),
    last_message_channel = v_last_channel,
    updated_at = NOW()
  WHERE id = p_unified_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 3. trip_messages writes drive the recompute, like the other two channels
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_update_unified_on_trip_message()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.unified_conversation_id IS NOT NULL THEN
      PERFORM update_unified_conversation_stats(OLD.unified_conversation_id);
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.unified_conversation_id IS NOT NULL THEN
    PERFORM update_unified_conversation_stats(NEW.unified_conversation_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_unified_on_trip ON trip_messages;
CREATE TRIGGER trg_update_unified_on_trip
  AFTER INSERT OR UPDATE OR DELETE ON trip_messages
  FOR EACH ROW EXECUTE FUNCTION trg_update_unified_on_trip_message();

-- ----------------------------------------------------------------------------
-- 4. The office may update exactly one column: is_read
-- ----------------------------------------------------------------------------
-- RLS rows-scopes; column grants do the column pinning that mig 291's
-- UPDATE policy could not express. service_role is unaffected.
REVOKE UPDATE ON trip_messages FROM authenticated;
GRANT UPDATE (is_read) ON trip_messages TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Grouped unread counts for the ops board (replaces the 500-row fetch)
-- ----------------------------------------------------------------------------
-- SECURITY INVOKER SQL: RLS on trip_messages scopes the caller's tenant.
CREATE OR REPLACE FUNCTION trip_unread_counts(p_itinerary_ids UUID[])
RETURNS TABLE (itinerary_id UUID, unread BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT tm.itinerary_id, COUNT(*)
  FROM trip_messages tm
  WHERE tm.itinerary_id = ANY (p_itinerary_ids)
    AND tm.direction = 'inbound'
    AND tm.is_read = FALSE
  GROUP BY tm.itinerary_id;
$$;

REVOKE ALL ON FUNCTION trip_unread_counts(UUID[]) FROM anon;

COMMIT;

-- --------------------------------------------------------------------------
-- Post-check (run after COMMIT):
--   1. View has the trip arm and stays hardened:
--      SELECT count(*) FROM pg_class WHERE relname='unified_messages'
--        AND reloptions @> ARRAY['security_invoker=true'];        -- expect 1
--      SELECT pg_get_viewdef('unified_messages'::regclass) LIKE '%trip%'; -- t
--   2. Trigger exists:
--      SELECT tgname FROM pg_trigger
--      WHERE tgrelid='trip_messages'::regclass AND NOT tgisinternal;
--   3. Column pinning:
--      SELECT has_column_privilege('authenticated','trip_messages','content','UPDATE');  -- f
--      SELECT has_column_privilege('authenticated','trip_messages','is_read','UPDATE');  -- t
--   4. Behavioural probe (service role, then DELETE the probes):
--      insert inbound trip_message w/ a conversation id ->
--        unified_conversations.unread_messages recomputed to 1,
--        last_message_channel='trip';
--      update it is_read=true -> unread recomputed to 0.
