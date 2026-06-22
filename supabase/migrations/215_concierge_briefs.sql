-- =====================================================================
-- Migration 215: Concierge Brief Webhook ingestion
-- =====================================================================
-- Receives structured planning briefs from the Travel2Egypt AI Concierge
-- (separate app) via POST /api/webhooks/concierge.
--
--   - concierge_briefs          : one CURRENT row per conversation_id
--                                 (Scenario A: update-in-place).
--   - concierge_brief_revisions : append-only history; UNIQUE(conversation_id,
--                                 brief_revision) is the idempotency key.
--   - Each brief upserts a lightweight clients row (status='prospect',
--     client_source='concierge'); client_id links back here.
--
-- ADAPTED for our multi-tenant model (sibling is single-tenant): both tables
-- carry tenant_id. Inbound briefs resolve a tenant in the webhook route
-- (env CONCIERGE_WEBHOOK_TENANT_ID, else the first tenant) and write via the
-- service-role key. RLS scopes the authenticated UI to its own tenant.
-- Date: 2026-06-22
-- =====================================================================

-- ============================================
-- TABLE 1: concierge_briefs (current state, one row per conversation)
-- ============================================
CREATE TABLE IF NOT EXISTS concierge_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- Identity / versioning (TEXT not UUID: ids are opaque per the spec)
  conversation_id TEXT NOT NULL,
  session_id TEXT,
  brief_revision INT NOT NULL DEFAULT 1,
  is_update BOOLEAN NOT NULL DEFAULT FALSE,
  prompt_version TEXT,
  language TEXT,                         -- raw code: 'en' | 'es'
  submitted_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- visitor.*
  visitor_name TEXT,
  visitor_email TEXT,
  visitor_phone TEXT,
  preferred_contact TEXT,
  visitor_timezone TEXT,

  -- trip.*
  travelers_count INT,
  travelers_detail TEXT,
  dates_specific TEXT,
  dates_window TEXT,
  trip_length_days INT,
  origin_city TEXT,
  nationality TEXT,
  international_flights BOOLEAN,

  -- preferences.*
  destinations JSONB,
  comfort_level TEXT,
  interests JSONB,
  must_see JSONB,
  must_avoid JSONB,

  -- constraints.*
  constraint_dietary TEXT,
  constraint_mobility TEXT,
  constraint_religious TEXT,
  constraint_medical TEXT,               -- sensitive PII — v2 retention/redaction

  -- narrative
  brief_summary TEXT,
  full_transcript JSONB,

  -- follow_up_window.*
  committed_response_by TIMESTAMPTZ,
  cairo_time_label TEXT,
  visitor_local_label TEXT,

  -- Autoura-side derived state
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  review_status TEXT NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('needs_review', 'in_progress', 'responded', 'archived')),
  is_actionable BOOLEAN NOT NULL DEFAULT TRUE,
  flags TEXT[] NOT NULL DEFAULT '{}',

  -- Audit / forward-compat
  raw_payload JSONB NOT NULL,
  request_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One current row per conversation (Scenario A update-in-place)
  CONSTRAINT uq_concierge_briefs_conversation UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_concierge_briefs_tenant ON concierge_briefs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_concierge_briefs_review_status ON concierge_briefs(review_status);
CREATE INDEX IF NOT EXISTS idx_concierge_briefs_client_id ON concierge_briefs(client_id);
CREATE INDEX IF NOT EXISTS idx_concierge_briefs_received_at ON concierge_briefs(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_concierge_briefs_actionable ON concierge_briefs(is_actionable);

COMMENT ON TABLE concierge_briefs IS 'Current state of each AI-Concierge planning brief (one row per conversation_id; history in concierge_brief_revisions).';
COMMENT ON COLUMN concierge_briefs.constraint_medical IS 'Sensitive PII. v2 must define retention/redaction policy.';

-- ============================================
-- TABLE 2: concierge_brief_revisions (append-only history + idempotency)
-- ============================================
CREATE TABLE IF NOT EXISTS concierge_brief_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  brief_id UUID NOT NULL REFERENCES concierge_briefs(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  brief_revision INT NOT NULL,
  is_update BOOLEAN,
  payload JSONB NOT NULL,
  request_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- THE idempotency key: replay of same (conversation, revision) conflicts here.
  CONSTRAINT uq_concierge_revision UNIQUE (conversation_id, brief_revision)
);

CREATE INDEX IF NOT EXISTS idx_concierge_revisions_tenant ON concierge_brief_revisions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_concierge_revisions_brief_id ON concierge_brief_revisions(brief_id);
CREATE INDEX IF NOT EXISTS idx_concierge_revisions_conversation ON concierge_brief_revisions(conversation_id);

COMMENT ON TABLE concierge_brief_revisions IS 'Append-only log of every accepted brief revision. UNIQUE(conversation_id, brief_revision) provides webhook idempotency.';

-- ============================================
-- ROW LEVEL SECURITY (tenant isolation for the UI; service-role writes)
-- ============================================
ALTER TABLE concierge_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE concierge_brief_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY concierge_briefs_tenant_read ON concierge_briefs
  FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());

CREATE POLICY concierge_briefs_service_role ON concierge_briefs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY concierge_revisions_tenant_read ON concierge_brief_revisions
  FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());

CREATE POLICY concierge_revisions_service_role ON concierge_brief_revisions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_concierge_briefs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_concierge_briefs_updated_at ON concierge_briefs;
CREATE TRIGGER trigger_concierge_briefs_updated_at
  BEFORE UPDATE ON concierge_briefs
  FOR EACH ROW EXECUTE FUNCTION update_concierge_briefs_updated_at();
