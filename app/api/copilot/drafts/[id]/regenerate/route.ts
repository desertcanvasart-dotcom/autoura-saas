// POST /api/copilot/drafts/[id]/regenerate — generate a fresh draft for the
// same inbound, optionally with an operator instruction. Reuses our existing
// generateDraftReplies engine (RAG + tone), recording parent_draft_id.
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { generateDraftReplies } from '@/lib/copilot-suggest'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase || !auth.tenant_id || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase, tenant_id, user } = auth
    const { id } = await params

    const body = await request.json().catch(() => ({}))
    const instruction: string | null = typeof body.instruction === 'string' && body.instruction.trim() ? body.instruction.trim() : null

    const { data: draft, error: dErr } = await supabase
      .from('communication_drafts')
      .select('id, tenant_id, thread_id')
      .eq('id', id)
      .single()
    if (dErr || !draft || draft.tenant_id !== tenant_id) {
      return NextResponse.json({ success: false, error: 'Draft not found' }, { status: 404 })
    }

    const { data: thread, error: tErr } = await supabase
      .from('communication_threads')
      .select('channel, whatsapp_conversation_id, email_conversation_id')
      .eq('id', draft.thread_id)
      .single()
    if (tErr || !thread) {
      return NextResponse.json({ success: false, error: 'Thread not found' }, { status: 404 })
    }

    const result = await generateDraftReplies({
      supabase,
      tenantId: tenant_id,
      channel: thread.channel,
      whatsappConversationId: thread.whatsapp_conversation_id || undefined,
      unifiedConversationId: thread.email_conversation_id || undefined,
      reviewerUserId: user.id,
      parentDraftId: id,
      instruction,
      count: 1,
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || 'Regeneration failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true, drafts: result.drafts || [] })
  } catch (e: any) {
    console.error('copilot draft regenerate error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
