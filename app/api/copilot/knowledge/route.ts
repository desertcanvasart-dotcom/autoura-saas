// ============================================
// GET  /api/copilot/knowledge — list knowledge entries
// POST /api/copilot/knowledge — create a knowledge entry (auto-chunks + embeds)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { chunkText, embedBatch, EMBEDDING_MODEL, toPgVector } from '@/lib/embeddings'

type KbSourceType = 'kb_faq' | 'kb_policy' | 'kb_tour' | 'kb_custom'
const KB_TYPES: KbSourceType[] = ['kb_faq', 'kb_policy', 'kb_tour', 'kb_custom']

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.supabase || !auth.tenant_id) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
  }
  const { supabase, tenant_id } = auth

  const { searchParams } = new URL(request.url)
  const sourceType = searchParams.get('source_type')
  const includeWhatsapp = searchParams.get('include_whatsapp') === 'true'

  let q = supabase
    .from('copilot_knowledge')
    .select('id, source_type, title, query_text, answer_text, metadata, is_active, parent_id, chunk_index, created_at, updated_at')
    .eq('tenant_id', tenant_id)
    .is('parent_id', null) // only return top-level rows (hide chunk siblings)
    .order('updated_at', { ascending: false })
    .limit(500)

  if (sourceType && KB_TYPES.includes(sourceType as KbSourceType)) {
    q = q.eq('source_type', sourceType)
  } else if (!includeWhatsapp) {
    q = q.in('source_type', KB_TYPES)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, entries: data || [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.supabase || !auth.tenant_id) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
  }
  const { supabase, tenant_id } = auth

  const body = await request.json().catch(() => ({}))
  const source_type: string = body.source_type
  const title: string | null = body.title?.trim() || null
  const content: string = (body.content || body.answer_text || '').toString()
  const question: string | null = body.question?.trim() || null
  const metadata: Record<string, any> = body.metadata || {}

  if (!KB_TYPES.includes(source_type as KbSourceType)) {
    return NextResponse.json({ success: false, error: `source_type must be one of ${KB_TYPES.join(', ')}` }, { status: 400 })
  }
  if (!content.trim()) {
    return NextResponse.json({ success: false, error: 'content is required' }, { status: 400 })
  }

  // For FAQs, the "query" is the question; for everything else, it's title + content.
  const buildQueryText = (chunk: string) => {
    if (source_type === 'kb_faq' && question) return question
    if (title) return `${title}\n\n${chunk}`
    return chunk
  }

  // Chunk long content; each chunk gets its own embedding for better recall.
  const chunks = chunkText(content)
  if (chunks.length === 0) {
    return NextResponse.json({ success: false, error: 'content is empty after normalization' }, { status: 400 })
  }

  // Embed all chunks in one batch
  let vectors: number[][]
  try {
    vectors = await embedBatch(chunks.map(buildQueryText))
  } catch (err: any) {
    return NextResponse.json({ success: false, error: `Embedding failed: ${err?.message}` }, { status: 502 })
  }
  if (vectors.length !== chunks.length) {
    return NextResponse.json({ success: false, error: 'Embedding count mismatch' }, { status: 502 })
  }

  // Insert parent row first
  const { data: parent, error: parentErr } = await supabase
    .from('copilot_knowledge')
    .insert({
      tenant_id,
      source_type,
      title,
      query_text: buildQueryText(chunks[0]),
      answer_text: chunks[0],
      metadata: { ...metadata, question: question || null, total_chunks: chunks.length },
      embedding: toPgVector(vectors[0]) as any,
      embedding_model: EMBEDDING_MODEL,
      chunk_index: 0,
    })
    .select('id')
    .single()

  if (parentErr || !parent) {
    return NextResponse.json({ success: false, error: parentErr?.message || 'Insert failed' }, { status: 500 })
  }

  // Insert additional chunks pointing to parent
  if (chunks.length > 1) {
    const childRows = chunks.slice(1).map((chunk, idx) => ({
      tenant_id,
      source_type,
      parent_id: parent.id,
      title,
      query_text: buildQueryText(chunk),
      answer_text: chunk,
      metadata: { ...metadata, question: question || null },
      embedding: toPgVector(vectors[idx + 1]) as any,
      embedding_model: EMBEDDING_MODEL,
      chunk_index: idx + 1,
    }))
    const { error: childErr } = await supabase.from('copilot_knowledge').insert(childRows)
    if (childErr) {
      // Rollback parent so caller sees consistent state
      await supabase.from('copilot_knowledge').delete().eq('id', parent.id)
      return NextResponse.json({ success: false, error: `Chunk insert failed: ${childErr.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, id: parent.id, chunks: chunks.length })
}
