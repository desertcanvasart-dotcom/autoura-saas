// ============================================
// Copilot retrieval — tenant-scoped semantic search
// ============================================
// Pulls top-K relevant knowledge entries for a query text.
// Caller MUST pass a tenant-scoped supabase client; tenant_id is also passed
// explicitly to the SQL function as a belt-and-suspenders check.
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { embedText, toPgVector } from './embeddings'

export type KnowledgeSourceType =
  | 'whatsapp_pair'
  | 'kb_faq'
  | 'kb_policy'
  | 'kb_tour'
  | 'kb_custom'

export interface RetrievedItem {
  id: string
  source_type: KnowledgeSourceType
  title: string | null
  query_text: string
  answer_text: string
  metadata: Record<string, any>
  similarity: number
}

/**
 * Embed the query and return the top-K most similar knowledge entries for a tenant.
 * `sourceTypes` lets you filter (e.g. only kb_* for general questions).
 */
export async function retrieveKnowledge(
  supabase: SupabaseClient,
  tenantId: string,
  queryText: string,
  opts: { limit?: number; sourceTypes?: KnowledgeSourceType[]; minSimilarity?: number } = {}
): Promise<RetrievedItem[]> {
  const limit = opts.limit ?? 6
  const minSim = opts.minSimilarity ?? 0.2

  const embedding = await embedText(queryText)
  const pgVec = toPgVector(embedding)

  const { data, error } = await supabase.rpc('match_copilot_knowledge', {
    p_tenant_id: tenantId,
    p_query_embedding: pgVec,
    p_match_count: limit,
    p_source_types: opts.sourceTypes ?? null,
  })

  if (error) {
    console.error('retrieveKnowledge rpc error:', error)
    return []
  }

  return ((data as RetrievedItem[]) || []).filter((r) => r.similarity >= minSim)
}

/**
 * Build a compact RAG context block for injection into a Claude system prompt.
 * Distinguishes past-reply exemplars from reference docs so the model treats
 * them differently.
 */
export function formatRetrievalContext(items: RetrievedItem[]): string {
  if (items.length === 0) return ''

  const pairs = items.filter((i) => i.source_type === 'whatsapp_pair')
  const docs = items.filter((i) => i.source_type !== 'whatsapp_pair')

  const parts: string[] = []

  if (pairs.length > 0) {
    parts.push('## Similar past conversations (for tone + style reference)')
    for (const p of pairs) {
      parts.push(
        `- Customer asked: "${truncate(p.query_text, 240)}"\n  We replied: "${truncate(p.answer_text, 400)}"`
      )
    }
  }

  if (docs.length > 0) {
    parts.push('\n## Relevant business knowledge (authoritative — prefer these facts)')
    for (const d of docs) {
      const label = `[${d.source_type.replace('kb_', '').toUpperCase()}${d.title ? ` — ${d.title}` : ''}]`
      parts.push(`${label}\n${truncate(d.answer_text, 1200)}`)
    }
  }

  return parts.join('\n')
}

function truncate(s: string, max: number): string {
  if (!s) return ''
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}
