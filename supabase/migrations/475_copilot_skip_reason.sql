-- ============================================
-- Copilot: why no draft was written
-- ============================================
-- A company's own email-copilot prompt (migration 474) may answer
-- "NO_DRAFT: <reason>" for mail that is not a travel enquiry — a supplier, a
-- job applicant, spam. No draft is stored then; the reason is kept on the
-- inbox entry (status 'skipped') so the inbox can say "Copilot skipped:
-- supplier email" instead of showing nothing.

ALTER TABLE public.communication_inbox
  ADD COLUMN IF NOT EXISTS copilot_skip_reason TEXT;

COMMENT ON COLUMN public.communication_inbox.copilot_skip_reason IS
  'Set when the copilot answered NO_DRAFT: <reason> — no draft was stored for this message.';
