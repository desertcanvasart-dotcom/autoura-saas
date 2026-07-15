-- =====================================================================
-- Migration 224: Concierge multi-brand routing
-- =====================================================================
-- The concierge webhook was single-destination by design (v1 owner
-- decision: default-tenant-via-env). With multiple brands feeding the
-- same concierge, each brand's briefs must route to its own tenant.
--
--   1. concierge_brand_mappings   : brand_key -> tenant routing table,
--                                   managed from super-admin.
--   2. tenant_features.concierge_enabled : per-tenant on/off switch so
--                                   the concierge can be sold as an
--                                   add-on (default OFF; super-admin
--                                   must enable the receiving tenant).
--   3. concierge_briefs.brand     : origin brand stamped on each brief.
--   4. Idempotency keys re-scoped to (tenant_id, ...) — they were
--      global, which is wrong once several tenants receive briefs.
-- Date: 2026-07-15
-- =====================================================================

-- ============================================
-- 1. Brand -> tenant mapping
-- ============================================
CREATE TABLE IF NOT EXISTS concierge_brand_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_key TEXT NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Keys are stored normalized (lowercase, trimmed); the webhook
  -- normalizes inbound values the same way before lookup.
  CONSTRAINT uq_concierge_brand_key UNIQUE (brand_key),
  CONSTRAINT chk_concierge_brand_key_normalized
    CHECK (brand_key = lower(btrim(brand_key)) AND char_length(brand_key) BETWEEN 1 AND 64)
);

CREATE INDEX IF NOT EXISTS idx_concierge_brand_mappings_tenant
  ON concierge_brand_mappings(tenant_id);

DROP TRIGGER IF EXISTS update_concierge_brand_mappings_updated_at ON concierge_brand_mappings;
CREATE TRIGGER update_concierge_brand_mappings_updated_at
  BEFORE UPDATE ON concierge_brand_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE concierge_brand_mappings IS
  'Routes inbound concierge briefs: payload `brand` -> tenant. Managed via super-admin; webhook reads with the service role.';

-- RLS: tenant members may read their own mapping (UI); writes go through
-- the service role only (super-admin API), same pattern as migration 215.
ALTER TABLE concierge_brand_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY concierge_brand_mappings_tenant_read ON concierge_brand_mappings
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY concierge_brand_mappings_service_role ON concierge_brand_mappings
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- 2. Per-tenant concierge switch (default OFF — sold as an add-on)
-- ============================================
ALTER TABLE tenant_features
  ADD COLUMN IF NOT EXISTS concierge_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN tenant_features.concierge_enabled IS
  'Whether this tenant receives AI Concierge briefs. Enforced by the webhook; toggled from super-admin.';

-- ============================================
-- 3. Stamp the origin brand on each brief
-- ============================================
ALTER TABLE concierge_briefs
  ADD COLUMN IF NOT EXISTS brand TEXT;

CREATE INDEX IF NOT EXISTS idx_concierge_briefs_brand ON concierge_briefs(brand);

-- ============================================
-- 4. Tenant-scope the idempotency keys
-- ============================================
-- One CURRENT row per conversation per tenant (was: per conversation
-- globally — a second tenant's brief with a colliding conversation_id
-- would have updated the first tenant's row).
ALTER TABLE concierge_briefs
  DROP CONSTRAINT IF EXISTS uq_concierge_briefs_conversation;
ALTER TABLE concierge_briefs
  ADD CONSTRAINT uq_concierge_briefs_tenant_conversation UNIQUE (tenant_id, conversation_id);

ALTER TABLE concierge_brief_revisions
  DROP CONSTRAINT IF EXISTS uq_concierge_revision;
ALTER TABLE concierge_brief_revisions
  ADD CONSTRAINT uq_concierge_revision_tenant UNIQUE (tenant_id, conversation_id, brief_revision);

COMMENT ON CONSTRAINT uq_concierge_revision_tenant ON concierge_brief_revisions IS
  'Webhook idempotency key, scoped per tenant since multi-brand routing (migration 224).';
