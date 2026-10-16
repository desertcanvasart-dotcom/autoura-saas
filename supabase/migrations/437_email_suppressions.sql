-- ============================================
-- 437: addresses that bounced or complained are not mailed again
-- ============================================
-- Nothing read Resend's bounce and complaint events: a client address that
-- bounced was shown as "sent", and the reminder job mailed it again every
-- week. Bounces and complaints on the shared sending domain are what gets an
-- account suspended — for every company at once. Resend now reports them to
-- /api/webhooks/resend, which records the address here; lib/email-send skips
-- it (and the reminder job pauses that invoice's reminders).
-- Server-only: no browser role reads or writes it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  detail TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_suppressions FROM anon, authenticated;

COMMIT;
