-- =====================================================================
-- Migration 229: Per-tenant locale (i18n groundwork)
-- =====================================================================
-- Decided model (pre-launch): per-tenant mono-lingual — each tenant
-- picks ONE language at onboarding; all its users see that language.
-- No in-app switcher. Localization itself ships post-launch (French,
-- then Spanish); this column is captured NOW so tenants onboarded in
-- the meantime already carry the data.
--
-- 'en' is the only fully-supported locale today; 'fr'/'es' record
-- intent and will activate when translations land.
-- =====================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en';

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_locale;
ALTER TABLE tenants
  ADD CONSTRAINT chk_tenants_locale CHECK (locale IN ('en', 'fr', 'es'));

COMMENT ON COLUMN tenants.locale IS
  'Tenant-wide UI/document language (per-tenant mono-lingual model). en fully supported; fr/es recorded at onboarding, activate when localization ships.';
