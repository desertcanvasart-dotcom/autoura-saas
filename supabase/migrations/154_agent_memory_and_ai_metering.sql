-- =====================================================================
-- Migration 154: Agent Memory System + AI Run Metering
-- Description: Adds per-tenant agent memory (persistent learning across
--              itinerary and pricing runs) and extends the billing system
--              to meter AI agent runs per subscription tier.
-- Date: 2026-04-15
-- =====================================================================

-- =====================================================================
-- 1. AGENT MEMORY TABLE
-- Stores accumulated knowledge per tenant — client preferences,
-- pricing patterns, inquiry patterns, supplier notes.
-- Injected into the generate-itinerary system prompt at runtime.
-- =====================================================================

CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- What kind of memory this is
  memory_type TEXT NOT NULL CHECK (memory_type IN (
    'client_preference',   -- e.g. "This client always requests private tours"
    'pricing_pattern',     -- e.g. "This DMC applies 32% margin on Siwa tours"
    'inquiry_pattern',     -- e.g. "Most inquiries from this tenant are Spanish-speaking"
    'supplier_note'        -- e.g. "Preferred hotel in Aswan is Sofitel Legend"
  )),

  -- Optional subject linkage (which client/supplier/tour type this is about)
  subject_id   UUID,
  subject_type TEXT CHECK (subject_type IN ('client', 'supplier', 'tour_type', 'destination')),
  subject_name TEXT, -- denormalised for fast prompt injection

  -- The actual memory content (injected verbatim into system prompt)
  content TEXT NOT NULL,

  -- Confidence 0.0–1.0 — starts low, rises as pattern repeats
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0.0 AND confidence <= 1.0),

  -- How many times this pattern has been observed
  observation_count INTEGER DEFAULT 1,

  -- NULL = pinned (never expires). Set for learned/decay memories.
  expires_at TIMESTAMPTZ DEFAULT NULL,

  -- Audit
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast tenant-scoped retrieval
CREATE INDEX IF NOT EXISTS idx_agent_memory_tenant       ON agent_memory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_type         ON agent_memory(tenant_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_agent_memory_subject      ON agent_memory(tenant_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_expires      ON agent_memory(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_memory_confidence   ON agent_memory(tenant_id, confidence DESC);

-- RLS
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_agent_memory"
  ON agent_memory FOR ALL
  USING (tenant_id = get_user_tenant_id());

COMMENT ON TABLE agent_memory IS
  'Per-tenant accumulated agent learning. Injected into AI system prompts to personalise itinerary and pricing generation over time.';

COMMENT ON COLUMN agent_memory.confidence IS
  'Confidence score 0–1. Rises with each repeated observation. Memories below 0.3 are not injected into prompts.';

COMMENT ON COLUMN agent_memory.expires_at IS
  'NULL = pinned (permanent). Decay memories expire after 90–365 days depending on tier.';


-- =====================================================================
-- 2. AGENT RUNS TABLE
-- Audit log of every itinerary/pricing agent invocation.
-- Used for: billing metering, debugging, memory feedback source.
-- =====================================================================

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  agent_type TEXT NOT NULL CHECK (agent_type IN ('itinerary', 'pricing')),
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Non-sensitive summaries for audit (no PII)
  input_summary  TEXT, -- e.g. "10-day Cairo+Luxor+Siwa, 4 pax, standard tier"
  output_summary TEXT, -- e.g. "Generated 10 days, €3,420 total cost"

  -- Performance
  tokens_used  INTEGER,
  duration_ms  INTEGER,

  -- Result
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failed', 'quota_exceeded')),

  -- Linkage to created records
  itinerary_id UUID REFERENCES itineraries(id) ON DELETE SET NULL,

  -- Memory state at time of run (for debugging)
  memories_injected INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant      ON agent_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_type        ON agent_runs(tenant_id, agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created     ON agent_runs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_itinerary   ON agent_runs(itinerary_id);

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_agent_runs"
  ON agent_runs FOR ALL
  USING (tenant_id = get_user_tenant_id());

COMMENT ON TABLE agent_runs IS
  'Audit log of every AI agent invocation. Source data for the memory feedback loop cron job.';


-- =====================================================================
-- 3. EXTEND tenant_usage WITH AI RUN COUNTERS
-- Slots directly into the existing increment_usage / check_usage_limit
-- pattern — no changes needed to those RPC functions for counting.
-- =====================================================================

ALTER TABLE tenant_usage
  ADD COLUMN IF NOT EXISTS itinerary_runs INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pricing_runs   INTEGER DEFAULT 0;

COMMENT ON COLUMN tenant_usage.itinerary_runs IS
  'Number of Itinerary Agent runs in this billing period';
COMMENT ON COLUMN tenant_usage.pricing_runs IS
  'Number of Pricing Agent runs in this billing period';


-- =====================================================================
-- 4. EXTEND subscription_plans WITH AI RUN LIMITS
-- NULL = unlimited (Pro/Enterprise behaviour)
-- =====================================================================

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS max_itinerary_runs_per_month INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_pricing_runs_per_month   INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS agent_memory_days            INTEGER DEFAULT 90;

COMMENT ON COLUMN subscription_plans.max_itinerary_runs_per_month IS
  'Monthly itinerary agent run cap. NULL = unlimited.';
COMMENT ON COLUMN subscription_plans.max_pricing_runs_per_month IS
  'Monthly pricing agent run cap. NULL = unlimited.';
COMMENT ON COLUMN subscription_plans.agent_memory_days IS
  'How many days of agent memory are retained. 90=Starter, 365=Growth, NULL=Pro unlimited.';

-- Apply limits to existing plans
UPDATE subscription_plans SET
  max_itinerary_runs_per_month = 30,
  max_pricing_runs_per_month   = 50,
  agent_memory_days            = 90
WHERE slug = 'starter';

UPDATE subscription_plans SET
  max_itinerary_runs_per_month = 100,
  max_pricing_runs_per_month   = 200,
  agent_memory_days            = 365
WHERE slug = 'professional';

UPDATE subscription_plans SET
  max_itinerary_runs_per_month = NULL,  -- unlimited
  max_pricing_runs_per_month   = NULL,  -- unlimited
  agent_memory_days            = NULL   -- unlimited
WHERE slug = 'enterprise';


-- =====================================================================
-- 5. EXTEND check_usage_limit RPC TO HANDLE AI METRICS
-- Adds 'itinerary_runs' and 'pricing_runs' cases to the existing
-- CASE statement in the check_usage_limit function.
-- =====================================================================

CREATE OR REPLACE FUNCTION check_usage_limit(
  p_tenant_id UUID,
  p_metric VARCHAR(50)
) RETURNS BOOLEAN AS $$
DECLARE
  v_limit   INTEGER;
  v_current INTEGER;
  v_subscription RECORD;
BEGIN
  -- Get subscription + plan details
  SELECT
    ts.id,
    ts.status,
    sp.max_quotes_per_month,
    sp.max_whatsapp_messages,
    sp.max_team_members,
    sp.max_gmail_accounts,
    sp.max_itinerary_runs_per_month,
    sp.max_pricing_runs_per_month
  INTO v_subscription
  FROM tenant_subscriptions ts
  JOIN subscription_plans sp ON sp.id = ts.plan_id
  WHERE ts.tenant_id = p_tenant_id
    AND ts.status IN ('trialing', 'active')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Get limit based on metric
  CASE p_metric
    WHEN 'quotes' THEN
      v_limit := v_subscription.max_quotes_per_month;
    WHEN 'whatsapp_messages' THEN
      v_limit := v_subscription.max_whatsapp_messages;
    WHEN 'team_members' THEN
      v_limit := v_subscription.max_team_members;
    WHEN 'gmail_accounts' THEN
      v_limit := v_subscription.max_gmail_accounts;
    WHEN 'itinerary_runs' THEN
      v_limit := v_subscription.max_itinerary_runs_per_month;
    WHEN 'pricing_runs' THEN
      v_limit := v_subscription.max_pricing_runs_per_month;
    ELSE
      -- Unknown metric — allow by default
      RETURN TRUE;
  END CASE;

  -- NULL limit = unlimited
  IF v_limit IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Get current usage for this billing period
  SELECT COALESCE(
    CASE p_metric
      WHEN 'itinerary_runs' THEN tu.itinerary_runs
      WHEN 'pricing_runs'   THEN tu.pricing_runs
      WHEN 'quotes'         THEN tu.quotes_created
      WHEN 'whatsapp_messages' THEN tu.whatsapp_messages_sent
      ELSE 0
    END, 0
  )
  INTO v_current
  FROM tenant_usage tu
  WHERE tu.tenant_id = p_tenant_id
    AND tu.period_end > NOW()
  ORDER BY tu.period_start DESC
  LIMIT 1;

  IF NOT FOUND THEN
    v_current := 0;
  END IF;

  RETURN v_current < v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_usage_limit IS
  'Returns TRUE if tenant is under limit for specified metric. Supports: quotes, whatsapp_messages, team_members, gmail_accounts, itinerary_runs, pricing_runs.';


-- =====================================================================
-- 6. EXTEND increment_usage RPC TO HANDLE AI METRICS
-- =====================================================================

CREATE OR REPLACE FUNCTION increment_usage(
  p_tenant_id UUID,
  p_metric    VARCHAR(50),
  p_amount    INTEGER DEFAULT 1
) RETURNS VOID AS $$
DECLARE
  v_subscription_id UUID;
  v_period_start    TIMESTAMPTZ;
  v_period_end      TIMESTAMPTZ;
  v_column_name     TEXT;
BEGIN
  -- Get active subscription
  SELECT id, current_period_start, current_period_end
  INTO v_subscription_id, v_period_start, v_period_end
  FROM tenant_subscriptions
  WHERE tenant_id = p_tenant_id
    AND status IN ('trialing', 'active')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Map metric to column
  CASE p_metric
    WHEN 'quotes'            THEN v_column_name := 'quotes_created';
    WHEN 'whatsapp_messages' THEN v_column_name := 'whatsapp_messages_sent';
    WHEN 'gmail_emails'      THEN v_column_name := 'gmail_emails_fetched';
    WHEN 'pdfs'              THEN v_column_name := 'pdfs_generated';
    WHEN 'api_calls'         THEN v_column_name := 'api_calls';
    WHEN 'itinerary_runs'    THEN v_column_name := 'itinerary_runs';
    WHEN 'pricing_runs'      THEN v_column_name := 'pricing_runs';
    ELSE RETURN;
  END CASE;

  -- Upsert usage record
  EXECUTE format('
    INSERT INTO tenant_usage (tenant_id, subscription_id, period_start, period_end, %I)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (tenant_id, period_start)
    DO UPDATE SET %I = tenant_usage.%I + $5, updated_at = NOW()
  ', v_column_name, v_column_name, v_column_name)
  USING p_tenant_id, v_subscription_id, v_period_start, v_period_end, p_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_usage IS
  'Increments usage counter for a metric. Metrics: quotes, whatsapp_messages, gmail_emails, pdfs, api_calls, itinerary_runs, pricing_runs.';


-- =====================================================================
-- 7. MEMORY EXPIRY CLEANUP FUNCTION
-- Called by the Railway cron job to prune expired memories.
-- =====================================================================

CREATE OR REPLACE FUNCTION purge_expired_agent_memories()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM agent_memory
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW();

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION purge_expired_agent_memories IS
  'Deletes expired agent memories. Called nightly by Railway cron.';


-- =====================================================================
-- 8. HELPER: GET ACTIVE MEMORIES FOR TENANT
-- Returns memories above confidence threshold, ordered by relevance.
-- Called by the generate-itinerary route before building system prompt.
-- =====================================================================

CREATE OR REPLACE FUNCTION get_tenant_agent_memories(
  p_tenant_id   UUID,
  p_subject_id  UUID DEFAULT NULL,
  p_subject_type TEXT DEFAULT NULL,
  p_min_confidence FLOAT DEFAULT 0.3,
  p_limit       INTEGER DEFAULT 20
)
RETURNS TABLE (
  id            UUID,
  memory_type   TEXT,
  subject_name  TEXT,
  content       TEXT,
  confidence    FLOAT,
  observation_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    am.id,
    am.memory_type,
    am.subject_name,
    am.content,
    am.confidence,
    am.observation_count
  FROM agent_memory am
  WHERE am.tenant_id = p_tenant_id
    AND am.confidence >= p_min_confidence
    AND (am.expires_at IS NULL OR am.expires_at > NOW())
    AND (p_subject_id IS NULL OR am.subject_id = p_subject_id)
    AND (p_subject_type IS NULL OR am.subject_type = p_subject_type)
  ORDER BY
    -- Client-specific memories first (most relevant)
    CASE WHEN am.subject_type = 'client' AND am.subject_id = p_subject_id THEN 0 ELSE 1 END,
    am.confidence DESC,
    am.observation_count DESC
  LIMIT p_limit;

  -- Update last_accessed_at for returned memories
  UPDATE agent_memory
  SET last_accessed_at = NOW()
  WHERE tenant_id = p_tenant_id
    AND confidence >= p_min_confidence
    AND (expires_at IS NULL OR expires_at > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_tenant_agent_memories IS
  'Returns active agent memories for a tenant, optionally filtered by subject. Used by generate-itinerary to build personalised system prompts.';
