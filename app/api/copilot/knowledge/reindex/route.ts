// ============================================
// POST /api/copilot/knowledge/reindex
// Backfills WhatsApp reply embeddings for the current tenant.
// Safe to re-run — idempotent via the UNIQUE (tenant_id, source_whatsapp_message_id)
// constraint on copilot_knowledge.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { embedBatch, EMBEDDING_MODEL, toPgVector } from '@/lib/embeddings'

const MAX_MESSAGES_PER_RUN = 500

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.supabase || !auth.tenant_id) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
  }
  const { supabase, tenant_id } = auth

  // 1. Pull candidate outbound messages that haven't been indexed yet.
  const { data: outbounds, error: outErr } = await supabase
    .from('whatsapp_messages')
    .select('id, conversation_id, message_body, message_text, sent_at, metadata')
    .eq('direction', 'outbound')
    .order('sent_at', { ascending: false })
    .limit(MAX_MESSAGES_PER_RUN)

  if (outErr) return NextResponse.json({ success: false, error: outErr.message }, { status: 500 })

  const candidates = (outbounds || []).filter((m: any) => {
    const text = (m.message_body || m.message_text || '').trim()
    if (text.length < 4) return false
    // Skip AI-generated replies
    if (m.metadata?.ai_generated) return false
    return true
  })

  if (candidates.length === 0) {
    return NextResponse.json({ success: true, scanned: outbounds?.length || 0, indexed: 0, reason: 'no manual outbound messages to index' })
  }

  // 2. Filter out already-indexed message ids
  const ids = candidates.map((m: any) => m.id)
  const { data: existing } = await supabase
    .from('copilot_knowledge')
    .select('source_whatsapp_message_id')
    .eq('tenant_id', tenant_id)
    .in('source_whatsapp_message_id', ids)

  const alreadyIndexed = new Set((existing || []).map((r: any) => r.source_whatsapp_message_id))
  const remaining = candidates.filter((m: any) => !alreadyIndexed.has(m.id))

  if (remaining.length === 0) {
    return NextResponse.json({ success: true, scanned: candidates.length, indexed: 0, reason: 'all already indexed' })
  }

  // 3. For each candidate, find its preceding inbound message
  type Prepared = { outboundId: string; conversationId: string; inboundText: string; outboundText: string; sentAt: string | null; clientPairMeta: any }
  const prepared: Prepared[] = []

  for (const msg of remaining) {
    const outboundText = (msg.message_body || msg.message_text || '').trim()
    const before = msg.sent_at || new Date().toISOString()
    const { data: inbound } = await supabase
      .from('whatsapp_messages')
      .select('message_body, message_text, sent_at')
      .eq('conversation_id', msg.conversation_id)
      .eq('direction', 'inbound')
      .lt('sent_at', before)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const inboundText = (inbound?.message_body || inbound?.message_text || '').trim()
    if (!inboundText) continue
    prepared.push({
      outboundId: msg.id,
      conversationId: msg.conversation_id,
      inboundText,
      outboundText,
      sentAt: msg.sent_at,
      clientPairMeta: { conversation_id: msg.conversation_id, paired_at: msg.sent_at },
    })
  }

  if (prepared.length === 0) {
    return NextResponse.json({ success: true, scanned: candidates.length, indexed: 0, reason: 'no paired inbound messages found' })
  }

  // 4. Batch embed the inbound queries
  let vectors: number[][]
  try {
    vectors = await embedBatch(prepared.map((p) => p.inboundText))
  } catch (err: any) {
    return NextResponse.json({ success: false, error: `Embedding failed: ${err?.message}` }, { status: 502 })
  }

  // 5. Bulk insert
  const rows = prepared.map((p, i) => ({
    tenant_id,
    source_type: 'whatsapp_pair',
    source_whatsapp_message_id: p.outboundId,
    query_text: p.inboundText,
    answer_text: p.outboundText,
    metadata: p.clientPairMeta,
    embedding: toPgVector(vectors[i]) as any,
    embedding_model: EMBEDDING_MODEL,
  }))

  const { error: insertErr, count } = await supabase
    .from('copilot_knowledge')
    .insert(rows, { count: 'exact' })

  if (insertErr) {
    return NextResponse.json({ success: false, error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    scanned: candidates.length,
    indexed: count ?? rows.length,
    note: candidates.length === MAX_MESSAGES_PER_RUN ? `Capped at ${MAX_MESSAGES_PER_RUN} messages per run — call again to continue.` : undefined,
  })
}
