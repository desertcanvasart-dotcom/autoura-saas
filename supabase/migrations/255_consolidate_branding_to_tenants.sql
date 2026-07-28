-- ============================================================================
-- 255 — branding lives on tenants, and only on tenants
-- ============================================================================
--
-- The bug this fixes: brand colors were WRITTEN to tenant_features (Settings
-- page, onboarding) but the document generators shipped in PR #95 READ
-- tenants.primary_color — which no UI path has ever written, so it still
-- holds the column default '#3B82F6' for every tenant. Result: operators
-- picked colors and saw them save; every PDF and the public share page
-- rendered blue regardless.
--
-- It was worse than one wrong reader. Three writers disagreed on the table:
--   Settings page/route     colors → tenant_features, logo → tenants
--   Onboarding branding     colors AND logo → tenant_features
--   Admin tenant settings   colors AND logo → tenants
--
-- Decision (with migration 038's own comment agreeing — it called
-- tenant_features.logo_url "cached from tenants table"): the TENANT owns its
-- identity and branding. tenants is the single source of truth; the
-- tenant_features branding columns are deprecated and no code reads or
-- writes them after this migration's companion code change.
-- ============================================================================

-- 1. Backfill: copy what operators actually chose (the tenant_features
--    values are what the Settings UI displayed back to them) onto tenants.
--    Guarded so a tenant the admin route already branded directly on
--    `tenants` (a non-default value) is not clobbered by a stale cache.
UPDATE tenants t
SET
  primary_color = f.primary_color,
  secondary_color = COALESCE(f.secondary_color, t.secondary_color),
  updated_at = NOW()
FROM tenant_features f
WHERE f.tenant_id = t.id
  AND f.primary_color IS NOT NULL
  AND (t.primary_color IS NULL OR t.primary_color = '#3B82F6');  -- untouched default only

-- logo_url: today NULL in both tables for every tenant, but onboarding wrote
-- to tenant_features, so carry over anything that ever landed there.
UPDATE tenants t
SET logo_url = f.logo_url, updated_at = NOW()
FROM tenant_features f
WHERE f.tenant_id = t.id
  AND f.logo_url IS NOT NULL
  AND t.logo_url IS NULL;

-- 2. Mark the losing columns so the next reader learns the story before
--    repeating it. (Kept, not dropped: dropping is a later cleanup once a
--    release cycle proves nothing else touched them.)
COMMENT ON COLUMN tenant_features.primary_color IS
  'DEPRECATED (mig 255): branding lives on tenants.primary_color. No code '
  'reads or writes this. Do not resurrect — three writers disagreeing on '
  'the table is how every PDF rendered the wrong color.';
COMMENT ON COLUMN tenant_features.secondary_color IS
  'DEPRECATED (mig 255): branding lives on tenants.secondary_color.';
COMMENT ON COLUMN tenant_features.logo_url IS
  'DEPRECATED (mig 255): branding lives on tenants.logo_url.';

-- ============================================================================
-- Verify after applying:
--   SELECT company_name, primary_color, secondary_color FROM tenants;
--   -- expect the tenant_features values (#2d3b2d / #0891b2 ...), not #3B82F6
-- ============================================================================
