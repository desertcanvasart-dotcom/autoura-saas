-- ============================================
-- Copilot: a company's own system prompt for email drafts
-- ============================================
-- When set, the email copilot (lib/copilot-suggest.ts buildPrompt) uses this
-- text verbatim as its system prompt, with {{COMPANY_NAME}}, {{TONE}} and
-- {{RATES_BLOCK}} filled in. NULL — every company today — keeps the built-in
-- prompt exactly as it was, so this changes nothing by itself.

ALTER TABLE public.tenant_features
  ADD COLUMN IF NOT EXISTS copilot_system_prompt TEXT;

COMMENT ON COLUMN public.tenant_features.copilot_system_prompt IS
  'Email copilot system prompt, used verbatim when set ({{COMPANY_NAME}}, {{TONE}}, {{RATES_BLOCK}} substituted). NULL = built-in prompt.';
