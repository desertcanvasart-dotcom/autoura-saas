-- ============================================================================
-- 383 — A WhatsApp conversation knows it has unread messages
-- ============================================================================
-- Operator, 2026-09-24: nothing tells you a new message has arrived — the
-- sidebar shows no count. The WhatsApp link now carries one, summed from
-- whatsapp_conversations.unread_count.
--
-- But nothing ever RAISED that column. The webhook stores each inbound message
-- in whatsapp_messages and never touches the conversation, so unread_count,
-- message_count and last_message_at stayed 0/0/NULL forever; only "mark read"
-- wrote unread_count (back to 0). The list's newest-first sort read that NULL
-- last_message_at too.
--
-- A trigger, not the webhook: every writer of whatsapp_messages (webhook,
-- office replies, the AI agent) is covered, and `unread_count + 1` is atomic —
-- two messages landing together can't both read 3 and write 4.
--
-- Only INBOUND raises unread (your own replies are never unread). Every
-- message moves last_message_at forward (GREATEST: a late-arriving older
-- message must not move it back) and counts toward message_count.

CREATE OR REPLACE FUNCTION public.bump_whatsapp_conversation_counters()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.whatsapp_conversations
     SET message_count   = COALESCE(message_count, 0) + 1,
         unread_count    = COALESCE(unread_count, 0)
                           + CASE WHEN NEW.direction = 'inbound' THEN 1 ELSE 0 END,
         last_message_at = GREATEST(
                             last_message_at,
                             COALESCE(NEW.sent_at, NEW.created_at, now())
                           )
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_whatsapp_conversation_counters() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_bump_whatsapp_conversation_counters ON public.whatsapp_messages;
CREATE TRIGGER trg_bump_whatsapp_conversation_counters
  AFTER INSERT ON public.whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_whatsapp_conversation_counters();

-- Bring existing conversations' message_count and last_message_at in line
-- with the messages they already hold. unread_count is left alone: old
-- messages nobody was ever told about should not all light up as "new" at
-- once. Live had one conversation and no messages on 2026-09-24, so this
-- changes nothing there; it is for other installs.
UPDATE public.whatsapp_conversations wc
   SET message_count   = s.total,
       last_message_at = GREATEST(wc.last_message_at, s.last_at)
  FROM (
    SELECT conversation_id,
           COUNT(*)::int AS total,
           MAX(COALESCE(sent_at, created_at)) AS last_at
      FROM public.whatsapp_messages
     GROUP BY conversation_id
  ) s
 WHERE wc.id = s.conversation_id;
