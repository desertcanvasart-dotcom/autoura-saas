-- ============================================================================
-- Publish: the Modern archetype (redesign, operator 2026-10-27)
-- ============================================================================
-- A company's site may use the Modern theme (sites/themes/modern) beside the
-- two Phase 1 archetypes. Only the allowed list changes; no row changes.
-- Idempotent: drops and recreates the one check.

ALTER TABLE public.publish_sites DROP CONSTRAINT IF EXISTS publish_sites_archetype_check;
ALTER TABLE public.publish_sites ADD CONSTRAINT publish_sites_archetype_check
  CHECK (archetype IN ('private_journeys', 'transparent_value', 'modern'));
