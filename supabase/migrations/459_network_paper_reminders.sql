-- ============================================
-- 459: remind network suppliers to send their papers
-- ============================================
-- Operator, 2026-11-01: suppliers tick "Let agencies find me" and stop
-- there — they never upload papers or press Send for checking, so the
-- Autoura team can never verify them. A daily job
-- (/api/cron/network-paper-reminders, lib/supplier-network-reminders) emails
-- them; these two columns keep it to one email a week, three at most.
-- No data changes.

BEGIN;

ALTER TABLE public.supplier_network_profiles
  ADD COLUMN IF NOT EXISTS papers_reminded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS papers_reminder_count INTEGER NOT NULL DEFAULT 0;

COMMIT;
