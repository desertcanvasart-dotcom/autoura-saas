// ============================================
// POST /api/ai/suggest-email-reply — user-initiated email draft generation
// GET  /api/ai/suggest-email-reply?email_conversation_id=... — fetch existing
//       pending drafts (used by the composer on mount)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { generateDraftReplies } from '@/lib/copilot-suggest'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase || !auth.tenant_id || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase, tenant_id, user } = auth

    const body = await request.json().catch(() => ({}))
    const email_conversation_id: string | undefined = body.email_conversation_id
    const count: number = Math.min(3, Math.max(1, Number(body.count) || 2))
    const parent_draft_id: string | null = body.parent_draft_id || null
    const instruction: string | null = body.instruction || null

    if (!email_conversation_id) {
      return NextResponse.json({ success: false, error: 'email_conversation_id required' }, { status: 400 })
    }

    const result = await generateDraftReplies({
      supabase, tenantId: tenant_id, channel: 'email',
      emailConversationId: email_conversation_id,
      reviewerUserId: user.id,
      count, parentDraftId: parent_draft_id, instruction,
      skipIfPendingExists: false,
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 })
    }

    return NextResponse.json({
      success: true,
      thread_id: result.thread_id,
      inbox_message_id: result.inbox_message_id,
      tone: result.tone,
      drafts: result.drafts,
      generation_time_ms: result.generation_time_ms,
      retrieved_count: result.retrieved_count,
    })
  } catch (err: any) {
    console.error('suggest-email-reply error:', err)
    return NextResponse.json({ success: false, error: err?.message || 'Internal error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.supabase || !auth.tenant_id) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
  }
  const { supabase, tenant_id } = auth

  const emailConvId = request.nextUrl.searchParams.get('email_conversation_id')
  if (!emailConvId) {
    return NextResponse.json({ success: false, error: 'email_conversation_id required' }, { status: 400 })
  }

  const { data: thread } = await supabase
    .from('communication_threads')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('channel', 'email')
    .eq('email_conversation_id', emailConvId)
    .maybeSingle()

  if (!thread?.id) {
    return NextResponse.json({ success: true, drafts: [] })
  }

  const { data: inbox } = await supabase
    .from('communication_inbox')
    .select('id, status')
    .eq('tenant_id', tenant_id)
    .eq('thread_id', thread.id)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!inbox?.id || inbox.status === 'responded' || inbox.status === 'skipped') {
    return NextResponse.json({ success: true, drafts: [] })
  }

  const { data: drafts } = await supabase
    .from('communication_drafts')
    .select('id, draft_body, ai_confidence, ai_flags, created_at')
    .eq('tenant_id', tenant_id)
    .eq('inbox_message_id', inbox.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  return NextResponse.json({
    success: true,
    thread_id: thread.id,
    inbox_message_id: inbox.id,
    drafts: drafts || [],
  })
}
