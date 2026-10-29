-- ============================================================================
-- Publish: the details the website template shows (operator brief 2026-10-28)
-- ============================================================================
-- Facts the tour page states that no record held until now:
--   tour_templates.meeting_point   — where the tour meets, in the operator's
--                                    words (NULL = not stated, never shown)
--   tour_templates.guide_languages — the languages its guides speak, as
--                                    two-letter codes ('en', 'fr'); empty =
--                                    not stated, never shown
-- The approximate times of a day tour's stops live in the itinerary itself
-- (each day's `stops`: [{ time: 'HH:MM' | null, name }]) — no column.
--
--   publish_pages.faq — a page's questions and answers, written and saved by
--                       a manager, per language: { "en": [{ "question",
--                       "answer" }], "fr": [...] }. Empty = no FAQ section.
-- Idempotent.

ALTER TABLE public.tour_templates ADD COLUMN IF NOT EXISTS meeting_point TEXT;
ALTER TABLE public.tour_templates ADD COLUMN IF NOT EXISTS guide_languages TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.tour_templates DROP CONSTRAINT IF EXISTS tour_templates_guide_languages_codes;
ALTER TABLE public.tour_templates ADD CONSTRAINT tour_templates_guide_languages_codes
  CHECK (array_to_string(guide_languages, ',') ~ '^([a-z]{2}(,[a-z]{2})*)?$');

ALTER TABLE public.publish_pages ADD COLUMN IF NOT EXISTS faq JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.publish_pages DROP CONSTRAINT IF EXISTS publish_pages_faq_shape;
ALTER TABLE public.publish_pages ADD CONSTRAINT publish_pages_faq_shape CHECK (jsonb_typeof(faq) = 'object');
