-- ============================================================================
-- 366 — Which conversations are waiting on US
-- ============================================================================
--
-- Nothing in the app answers "who has written to us and had no reply". The
-- inbox sorts by last message, which mixes a customer's question in with our
-- own last answer, and the dashboard's "Needs a reply" reads unread flags —
-- so a message someone OPENED and then did not answer disappears from it.
--
-- Three columns on unified_conversations, maintained where every other
-- conversation statistic is maintained (update_unified_conversation_stats,
-- migration 125), so they cannot drift from the messages:
--
--   last_inbound_at       the customer's newest message
--   last_outbound_at      our newest reply
--   awaiting_reply_since  the customer's FIRST message after our last reply,
--                         NULL when the conversation is answered
--
-- awaiting_reply_since is the age of the wait, not of the last message: a
-- customer who writes three times while waiting is still waiting since the
-- first of them.
--
-- Both channels count. The sibling app tracks email only; here WhatsApp and
-- email share one conversation, and a customer waiting on WhatsApp is waiting
-- just the same.
-- ============================================================================

BEGIN;

ALTER TABLE public.unified_conversations
  ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_outbound_at timestamptz,
  ADD COLUMN IF NOT EXISTS awaiting_reply_since timestamptz;

COMMENT ON COLUMN public.unified_conversations.awaiting_reply_since IS
  'The customer''s first message after our last reply — NULL when the conversation is answered. Maintained by update_unified_conversation_stats().';

CREATE INDEX IF NOT EXISTS idx_unified_conversations_awaiting
  ON public.unified_conversations (tenant_id, awaiting_reply_since)
  WHERE awaiting_reply_since IS NOT NULL;

-- One place computes it: the same function that keeps the counts and the
-- preview. This is the LIVE definition of that function (it counts trip
-- messages too, and qualifies every column — migration 125's copy does not,
-- and replacing the live one with that older body would both regress the
-- traveller-chat counts and make it fail on an ambiguous `status`). Only the
-- three new columns are added to it.
CREATE OR REPLACE FUNCTION update_unified_conversation_stats(p_unified_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total INTEGER := 0;
  v_unread INTEGER := 0;
  v_last_at TIMESTAMPTZ;
  v_last_preview TEXT;
  v_last_channel VARCHAR(20);
  v_last_inbound TIMESTAMPTZ;
  v_last_outbound TIMESTAMPTZ;
  v_awaiting TIMESTAMPTZ;
BEGIN
  SELECT
    COUNT(*),
    COALESCE(SUM(CASE WHEN wm.status != 'read' AND wm.direction = 'inbound' THEN 1 ELSE 0 END), 0),
    MAX(wm.sent_at)
  INTO v_total, v_unread, v_last_at
  FROM whatsapp_messages wm
  JOIN whatsapp_conversations wc ON wm.conversation_id = wc.id
  JOIN unified_conversations uc ON uc.whatsapp_conversation_id = wc.id
  WHERE uc.id = p_unified_id;

  SELECT
    v_total + COUNT(*),
    v_unread + COALESCE(SUM(CASE WHEN NOT em.is_read AND em.direction = 'inbound' THEN 1 ELSE 0 END), 0),
    GREATEST(v_last_at, MAX(em.sent_at))
  INTO v_total, v_unread, v_last_at
  FROM email_messages em
  WHERE em.unified_conversation_id = p_unified_id;

  SELECT
    v_total + COUNT(*),
    v_unread + COALESCE(SUM(CASE WHEN NOT tm.is_read AND tm.direction = 'inbound' THEN 1 ELSE 0 END), 0),
    GREATEST(v_last_at, MAX(tm.created_at))
  INTO v_total, v_unread, v_last_at
  FROM trip_messages tm
  WHERE tm.unified_conversation_id = p_unified_id;

  SELECT um.content, um.channel INTO v_last_preview, v_last_channel
  FROM unified_messages um
  WHERE um.unified_conversation_id = p_unified_id
  ORDER BY um.message_at DESC
  LIMIT 1;

  -- Who spoke last, across every channel this conversation carries.
  WITH spoken AS (
    SELECT um.direction, um.message_at
      FROM unified_messages um
     WHERE um.unified_conversation_id = p_unified_id
    UNION ALL
    SELECT tm.direction, tm.created_at
      FROM trip_messages tm
     WHERE tm.unified_conversation_id = p_unified_id
  )
  SELECT
    MAX(message_at) FILTER (WHERE direction = 'inbound'),
    MAX(message_at) FILTER (WHERE direction = 'outbound')
  INTO v_last_inbound, v_last_outbound
  FROM spoken;

  -- The FIRST unanswered message, not the newest: a customer who writes three
  -- times while waiting has been waiting since the first of them.
  WITH spoken AS (
    SELECT um.direction, um.message_at
      FROM unified_messages um
     WHERE um.unified_conversation_id = p_unified_id
    UNION ALL
    SELECT tm.direction, tm.created_at
      FROM trip_messages tm
     WHERE tm.unified_conversation_id = p_unified_id
  )
  SELECT MIN(message_at)
  INTO v_awaiting
  FROM spoken
  WHERE direction = 'inbound'
    AND (v_last_outbound IS NULL OR message_at > v_last_outbound);

  UPDATE unified_conversations
  SET
    total_messages = COALESCE(v_total, 0),
    unread_messages = COALESCE(v_unread, 0),
    last_message_at = v_last_at,
    last_message_preview = LEFT(v_last_preview, 100),
    last_message_channel = v_last_channel,
    last_inbound_at = v_last_inbound,
    last_outbound_at = v_last_outbound,
    awaiting_reply_since = v_awaiting,
    updated_at = NOW()
  WHERE id = p_unified_id;
END;
$$ LANGUAGE plpgsql;

-- Fill in what already exists, in one pass.
WITH spoken AS (
  SELECT um.unified_conversation_id AS id, um.direction, um.message_at
    FROM unified_messages um
   WHERE um.unified_conversation_id IS NOT NULL
  UNION ALL
  SELECT tm.unified_conversation_id AS id, tm.direction, tm.created_at
    FROM trip_messages tm
   WHERE tm.unified_conversation_id IS NOT NULL
), spoke AS (
  SELECT id,
         MAX(message_at) FILTER (WHERE direction = 'inbound') AS last_inbound,
         MAX(message_at) FILTER (WHERE direction = 'outbound') AS last_outbound
    FROM spoken
   GROUP BY id
), waiting AS (
  SELECT s.id, s.last_inbound, s.last_outbound,
         (SELECT MIN(m.message_at)
            FROM spoken m
           WHERE m.id = s.id
             AND m.direction = 'inbound'
             AND (s.last_outbound IS NULL OR m.message_at > s.last_outbound)) AS awaiting
  FROM spoke s
)
UPDATE unified_conversations c
   SET last_inbound_at = w.last_inbound,
       last_outbound_at = w.last_outbound,
       awaiting_reply_since = w.awaiting
  FROM waiting w
 WHERE c.id = w.id;

COMMIT;
