-- ============================================
-- MIGRATION 205: Copilot Knowledge Base (semantic RAG)
-- ============================================
-- Adds pgvector + a unified copilot_knowledge table that stores embeddings
-- for two source families:
--   (a) WhatsApp turn-pairs (inbound question + agent reply) — auto-populated
--   (b) Tenant-curated knowledge docs (FAQs, policies, tour descriptions)
--
-- Retrieval is tenant-scoped via RLS + explicit tenant_id filter.
-- ============================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS copilot_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Source taxonomy
  source_type TEXT NOT NULL CHECK (source_type IN (
    'whatsapp_pair',   -- inbound question + paired agent reply
    'kb_faq',          -- FAQ Q/A
    'kb_policy',       -- policy / terms text
    'kb_tour',         -- tour description / programme
    'kb_custom'        -- anything else the tenant wants to index
  )),
  -- Optional FK into whatsapp_messages for the *reply* message (source of truth)
  source_whatsapp_message_id UUID REFERENCES whatsapp_messages(id) ON DELETE CASCADE,

  -- Free-form metadata (e.g. language, conversation_id, client_id)
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Retrieval key (what we embed) vs retrieval value (what we return)
  -- For whatsapp_pair: query_text = inbound message; answer_text = agent reply
  -- For kb_*:          query_text = title + content; answer_text = content
  title TEXT,
  query_text TEXT NOT NULL,
  answer_text TEXT NOT NULL,

  -- Chunking (multi-chunk docs share a parent_id)
  parent_id UUID REFERENCES copilot_knowledge(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL DEFAULT 0,

  -- 1536 dims = OpenAI text-embedding-3-small
  embedding vector(1536),
  embedding_model TEXT,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One entry per whatsapp reply message (idempotent auto-indexing)
  UNIQUE (tenant_id, source_whatsapp_message_id)
);

CREATE INDEX IF NOT EXISTS idx_copilot_kn_tenant ON copilot_knowledge(tenant_id);
CREATE INDEX IF NOT EXISTS idx_copilot_kn_source_type ON copilot_knowledge(source_type);
CREATE INDEX IF NOT EXISTS idx_copilot_kn_parent ON copilot_knowledge(parent_id);
CREATE INDEX IF NOT EXISTS idx_copilot_kn_active ON copilot_knowledge(is_active) WHERE is_active;

-- Vector index (HNSW is best for read-heavy RAG; cosine distance)
-- Requires pgvector >= 0.5.0 which Supabase supports.
CREATE INDEX IF NOT EXISTS idx_copilot_kn_embedding_hnsw
  ON copilot_knowledge USING hnsw (embedding vector_cosine_ops);

-- ============================================
-- RLS
-- ============================================
ALTER TABLE copilot_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can view copilot knowledge"   ON copilot_knowledge;
DROP POLICY IF EXISTS "Tenant members can insert copilot knowledge" ON copilot_knowledge;
DROP POLICY IF EXISTS "Tenant members can update copilot knowledge" ON copilot_knowledge;
DROP POLICY IF EXISTS "Tenant members can delete copilot knowledge" ON copilot_knowledge;

CREATE POLICY "Tenant members can view copilot knowledge"
  ON copilot_knowledge FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE POLICY "Tenant members can insert copilot knowledge"
  ON copilot_knowledge FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE POLICY "Tenant members can update copilot knowledge"
  ON copilot_knowledge FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE POLICY "Tenant members can delete copilot knowledge"
  ON copilot_knowledge FOR DELETE
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

-- ============================================
-- updated_at trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_copilot_knowledge_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_copilot_knowledge_updated_at ON copilot_knowledge;
CREATE TRIGGER trg_copilot_knowledge_updated_at
  BEFORE UPDATE ON copilot_knowledge
  FOR EACH ROW EXECUTE FUNCTION update_copilot_knowledge_updated_at();

-- ============================================
-- Tenant-scoped semantic search function
-- ============================================
-- Called by the server with service role to do top-K retrieval for a tenant.
-- Using SECURITY DEFINER is NOT needed — server passes tenant_id explicitly
-- and RLS via anon/auth'd client enforces isolation. But we also guard here.
CREATE OR REPLACE FUNCTION match_copilot_knowledge(
  p_tenant_id UUID,
  p_query_embedding vector(1536),
  p_match_count INT DEFAULT 6,
  p_source_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  source_type TEXT,
  title TEXT,
  query_text TEXT,
  answer_text TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    source_type,
    title,
    query_text,
    answer_text,
    metadata,
    1 - (embedding <=> p_query_embedding) AS similarity
  FROM copilot_knowledge
  WHERE tenant_id = p_tenant_id
    AND is_active = TRUE
    AND embedding IS NOT NULL
    AND (p_source_types IS NULL OR source_type = ANY(p_source_types))
  ORDER BY embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;
