// ============================================
// POST /api/ai/suggest-email-reply — user-initiated email draft generation
// GET  /api/ai/suggest-email-reply?email_conversation_id=... — fetch existing
//       pending drafts (used by the composer on mount)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { generateDraftReplies } from '@/lib/copilot-suggest'
import { aiBudgetDenied } from '@/lib/ai-guard'

/**
 * The conversation a Gmail thread is filed under — the Email tab knows only
 * the thread. Null when the thread has not synced in yet.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function conversationForThread(supabase: any, tenantId: string, gmailThreadId: string): Promise<string | null> {
  const { data } = await supabase
    .from('email_messages')
    .select('unified_conversation_id')
    .eq('tenant_id', tenantId)
    .eq('gmail_thread_id', gmailThreadId)
    .not('unified_conversation_id', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as { unified_conversation_id?: string | null } | null)?.unified_conversation_id ?? null
}

const NOT_SYNCED = 'This email has not reached Conversations yet — it syncs every few minutes. Try again shortly.'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase || !auth.tenant_id || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase, tenant_id, user } = auth
    const overBudget = await aiBudgetDenied(user.id, tenant_id)
    if (overBudget) return overBudget

    const body = await request.json().catch(() => ({}))
    // Canonical param is unified_conversation_id; keep email_conversation_id as a deprecated alias.
    // The Email tab sends the Gmail thread instead (gmail_thread_id).
    let unified_conversation_id: string | undefined =
      body.unified_conversation_id || body.email_conversation_id
    if (!unified_conversation_id && typeof body.gmail_thread_id === 'string' && body.gmail_thread_id) {
      unified_conversation_id = (await conversationForThread(supabase, tenant_id, body.gmail_thread_id)) ?? undefined
      if (!unified_conversation_id) return NextResponse.json({ success: false, error: NOT_SYNCED }, { status: 404 })
    }
    const count: number = Math.min(3, Math.max(1, Number(body.count) || 2))
    const parent_draft_id: string | null = body.parent_draft_id || null
    const instruction: string | null = body.instruction || null

    if (!unified_conversation_id) {
      return NextResponse.json({ success: false, error: 'unified_conversation_id required' }, { status: 400 })
    }

    const result = await generateDraftReplies({
      supabase, tenantId: tenant_id, channel: 'email',
      unifiedConversationId: unified_conversation_id,
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
      unified_conversation_id,
      // The company prompt answered NO_DRAFT: (migration 475).
      skipped: result.skipped ?? false,
      skip_reason: result.skip_reason ?? null,
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

  let unifiedConvId =
    request.nextUrl.searchParams.get('unified_conversation_id') ||
    request.nextUrl.searchParams.get('email_conversation_id')
  const gmailThreadId = request.nextUrl.searchParams.get('gmail_thread_id')
  if (!unifiedConvId && gmailThreadId) {
    unifiedConvId = await conversationForThread(supabase, tenant_id, gmailThreadId)
    // Not synced yet: nothing to show, and Suggest Reply will say why.
    if (!unifiedConvId) return NextResponse.json({ success: true, drafts: [], unified_conversation_id: null })
  }
  if (!unifiedConvId) {
    return NextResponse.json({ success: false, error: 'unified_conversation_id required' }, { status: 400 })
  }

  const { data: thread } = await supabase
    .from('communication_threads')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('channel', 'email')
    .eq('unified_conversation_id', unifiedConvId)
    .maybeSingle()

  if (!thread?.id) {
    return NextResponse.json({ success: true, drafts: [], unified_conversation_id: unifiedConvId })
  }

  const { data: inbox } = await supabase
    .from('communication_inbox')
    .select('id, status, copilot_skip_reason')
    .eq('tenant_id', tenant_id)
    .eq('thread_id', thread.id)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!inbox?.id || inbox.status === 'responded' || inbox.status === 'skipped') {
    const skipReason = inbox?.status === 'skipped' ? (inbox as { copilot_skip_reason?: string | null }).copilot_skip_reason ?? null : null
    return NextResponse.json({ success: true, drafts: [], skipped: Boolean(skipReason), skip_reason: skipReason, unified_conversation_id: unifiedConvId })
  }

  const { data: drafts } = await supabase
    .from('communication_drafts')
    .select('id, draft_body, ai_confidence, ai_flags, context_used, created_at')
    .eq('tenant_id', tenant_id)
    .eq('inbox_message_id', inbox.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  // A draft approved in Copilot ("Approve & hand off") waits here to be sent:
  // the composer opens with it filled in, with the reviewer's edits.
  const { data: approvedRows } = await supabase
    .from('communication_drafts')
    .select('id, draft_body, edited_body, ai_flags, context_used')
    .eq('tenant_id', tenant_id)
    .eq('inbox_message_id', inbox.id)
    .eq('status', 'approved')
    .order('reviewed_at', { ascending: false })
    .limit(1)
  const approvedRow = approvedRows?.[0]
  const approved = approvedRow
    ? {
        id: approvedRow.id,
        body: approvedRow.edited_body || approvedRow.draft_body,
        subject: (approvedRow.ai_flags as { subject?: string } | null)?.subject ?? null,
        // The RATES block it was written from (company prompt only) — "Prices used".
        rates: typeof (approvedRow.context_used as { rates?: unknown } | null)?.rates === 'string'
          ? (approvedRow.context_used as { rates: string }).rates
          : null,
      }
    : null

  return NextResponse.json({
    success: true,
    thread_id: thread.id,
    inbox_message_id: inbox.id,
    drafts: drafts || [],
    approved,
    unified_conversation_id: unifiedConvId,
  })
}
