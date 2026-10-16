-- ============================================
-- 431: indexes for the queries that grow with each company
-- ============================================
-- Only single-column indexes existed for these, so the planner picked a
-- global one (e.g. created_at across every company) and filtered row by row,
-- calling the RLS tenant function per row. Each matches a query the app runs
-- on every page load or every few minutes (second launch review, 2026-10-16).
-- IF NOT EXISTS throughout; the tables are small at launch, so plain (not
-- CONCURRENTLY) builds inside the transaction are fine.

BEGIN;

-- Lists ordered newest first, per company.
CREATE INDEX IF NOT EXISTS idx_clients_tenant_created ON public.clients (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_itineraries_tenant_created ON public.itineraries (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_created ON public.tasks (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant_created ON public.tenant_activity_logs (tenant_id, created_at DESC);

-- Mail: the sync's lookback window and the thread view / unread count.
CREATE INDEX IF NOT EXISTS idx_email_messages_tenant_created ON public.email_messages (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_conv_sent ON public.email_messages (unified_conversation_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_email_messages_conv_unread ON public.email_messages (unified_conversation_id)
  WHERE direction = 'inbound' AND is_read = false;
CREATE INDEX IF NOT EXISTS idx_unified_conversations_tenant_status_last
  ON public.unified_conversations (tenant_id, status, last_message_at DESC);

-- WhatsApp thread view.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conv_sent ON public.whatsapp_messages (conversation_id, sent_at DESC);

-- Notifications: the bell's unread count, and the task-reminder dedupe.
CREATE INDEX IF NOT EXISTS idx_notifications_member_unread ON public.notifications (team_member_id)
  WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_task_type_created
  ON public.notifications (related_task_id, type, created_at);

-- The daily dunning sweep across every company.
CREATE INDEX IF NOT EXISTS idx_invoices_reminder_due ON public.invoices (next_reminder_date)
  WHERE balance_due > 0 AND reminder_paused = false;

-- The occasional clean-up in rate_limit_take (427).
CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_window ON public.rate_limit_buckets (window_start);

COMMIT;
