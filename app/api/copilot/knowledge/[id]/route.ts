// ============================================
// PATCH  /api/copilot/knowledge/[id] — update + re-embed
// DELETE /api/copilot/knowledge/[id] — delete (cascades to chunks)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { chunkText, embedBatch, EMBEDDING_MODEL, toPgVector } from '@/lib/embeddings'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error || !auth.supabase || !auth.tenant_id) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
  }
  const { supabase, tenant_id } = auth
  const { id } = await params

  const body = await request.json().catch(() => ({}))
  const title: string | null | undefined = body.title
  const content: string | undefined = body.content ?? body.answer_text
  const question: string | null | undefined = body.question
  const is_active: boolean | undefined = body.is_active
  const metadata: Record<string, any> | undefined = body.metadata

  const { data: existing, error: existingErr } = await supabase
    .from('copilot_knowledge')
    .select('id, tenant_id, source_type, parent_id')
    .eq('id', id)
    .single()

  if (existingErr || !existing || existing.tenant_id !== tenant_id) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  }
  if (existing.parent_id) {
    return NextResponse.json({ success: false, error: 'Cannot edit a chunk directly — edit the parent entry' }, { status: 400 })
  }

  // Toggle-only update (no re-embed)
  if (content === undefined && title === undefined && question === undefined) {
    const patch: Record<string, any> = {}
    if (typeof is_active === 'boolean') patch.is_active = is_active
    if (metadata) patch.metadata = metadata
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
    }
    // Propagate is_active to chunks
    if (typeof is_active === 'boolean') {
      await supabase.from('copilot_knowledge').update({ is_active }).eq('parent_id', id)
    }
    const { data: updated, error: updErr } = await supabase
      .from('copilot_knowledge')
      .update(patch)
      .eq('id', id)
      .select('id, is_active, metadata')
      .single()
    if (updErr) return NextResponse.json({ success: false, error: updErr.message }, { status: 500 })
    return NextResponse.json({ success: true, entry: updated })
  }

  // Full re-embed path
  if (!content || !content.trim()) {
    return NextResponse.json({ success: false, error: 'content is required for re-embed' }, { status: 400 })
  }

  const chunks = chunkText(content)
  if (chunks.length === 0) {
    return NextResponse.json({ success: false, error: 'content empty after normalization' }, { status: 400 })
  }

  const buildQueryText = (chunk: string) => {
    if (existing.source_type === 'kb_faq' && question) return question
    if (title !== undefined && title !== null) return `${title}\n\n${chunk}`
    return chunk
  }

  let vectors: number[][]
  try {
    vectors = await embedBatch(chunks.map(buildQueryText))
  } catch (err: any) {
    return NextResponse.json({ success: false, error: `Embedding failed: ${err?.message}` }, { status: 502 })
  }

  // Delete old chunks, update parent, insert new chunks
  await supabase.from('copilot_knowledge').delete().eq('parent_id', id)

  const parentPatch: Record<string, any> = {
    title: title ?? null,
    query_text: buildQueryText(chunks[0]),
    answer_text: chunks[0],
    embedding: toPgVector(vectors[0]) as any,
    embedding_model: EMBEDDING_MODEL,
    chunk_index: 0,
  }
  if (metadata) parentPatch.metadata = { ...metadata, question: question ?? null, total_chunks: chunks.length }
  if (typeof is_active === 'boolean') parentPatch.is_active = is_active

  const { data: updatedParent, error: parentErr } = await supabase
    .from('copilot_knowledge')
    .update(parentPatch)
    .eq('id', id)
    .select('id, source_type')
    .single()

  if (parentErr || !updatedParent) {
    return NextResponse.json({ success: false, error: parentErr?.message || 'Update failed' }, { status: 500 })
  }

  if (chunks.length > 1) {
    const childRows = chunks.slice(1).map((chunk, idx) => ({
      tenant_id,
      source_type: existing.source_type,
      parent_id: id,
      title: title ?? null,
      query_text: buildQueryText(chunk),
      answer_text: chunk,
      metadata: { ...(metadata || {}), question: question ?? null },
      embedding: toPgVector(vectors[idx + 1]) as any,
      embedding_model: EMBEDDING_MODEL,
      chunk_index: idx + 1,
      is_active: typeof is_active === 'boolean' ? is_active : true,
    }))
    const { error: childErr } = await supabase.from('copilot_knowledge').insert(childRows)
    if (childErr) {
      return NextResponse.json({ success: false, error: `Chunk insert failed: ${childErr.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, id, chunks: chunks.length })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error || !auth.supabase || !auth.tenant_id) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
  }
  const { supabase, tenant_id } = auth
  const { id } = await params

  const { data: existing } = await supabase
    .from('copilot_knowledge')
    .select('id, tenant_id, parent_id')
    .eq('id', id)
    .single()

  if (!existing || existing.tenant_id !== tenant_id) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  }
  if (existing.parent_id) {
    return NextResponse.json({ success: false, error: 'Cannot delete a chunk — delete the parent' }, { status: 400 })
  }

  const { error } = await supabase.from('copilot_knowledge').delete().eq('id', id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
