// ============================================
// PATCH /api/ai/suggest-reply/[draftId]
// Actions: accept | dismiss | mark_sent
//   - accept:   approves a draft (user inserted it into the compose box)
//   - dismiss:  rejects a draft
//   - mark_sent: called after the outbound Twilio send succeeded; records send_message_id
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

type Action = 'accept' | 'dismiss' | 'mark_sent'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase || !auth.tenant_id || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase, tenant_id, user } = auth
    const { draftId } = await params

    const body = await request.json().catch(() => ({}))
    const action: Action | undefined = body.action
    const send_message_id: string | undefined = body.send_message_id
    const send_error: string | undefined = body.send_error
    const edited_body: string | undefined = body.edited_body

    if (!action || !['accept', 'dismiss', 'mark_sent'].includes(action)) {
      return NextResponse.json({ success: false, error: 'action must be accept | dismiss | mark_sent' }, { status: 400 })
    }

    const { data: draft, error: draftErr } = await supabase
      .from('communication_drafts')
      .select('id, tenant_id, inbox_message_id, status')
      .eq('id', draftId)
      .single()

    if (draftErr || !draft || draft.tenant_id !== tenant_id) {
      return NextResponse.json({ success: false, error: 'Draft not found' }, { status: 404 })
    }

    const nowIso = new Date().toISOString()
    const patch: Record<string, any> = { reviewed_by: user.id, reviewed_at: nowIso }

    if (action === 'accept') {
      if (draft.status === 'sent' || draft.status === 'rejected') {
        return NextResponse.json({ success: false, error: `Draft already ${draft.status}` }, { status: 409 })
      }
      patch.status = 'approved'
      if (edited_body && edited_body.trim()) {
        patch.edited_body = edited_body.trim()
        patch.was_edited = true
      }
    } else if (action === 'dismiss') {
      patch.status = 'rejected'
    } else if (action === 'mark_sent') {
      patch.status = 'sent'
      patch.sent_at = nowIso
      if (send_message_id) patch.send_message_id = send_message_id
      if (send_error) patch.send_error = send_error
      if (edited_body && edited_body.trim()) {
        patch.edited_body = edited_body.trim()
        patch.was_edited = true
      }
    }

    const { data: updated, error: updateErr } = await supabase
      .from('communication_drafts')
      .update(patch)
      .eq('id', draftId)
      .select('id, status, edited_body, was_edited, sent_at, send_message_id')
      .single()

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 })
    }

    // Update inbox status when the thread is resolved for this inbound
    if (action === 'mark_sent') {
      await supabase
        .from('communication_inbox')
        .update({ status: 'responded', processed_at: nowIso })
        .eq('id', draft.inbox_message_id)
    }

    return NextResponse.json({ success: true, draft: updated })
  } catch (err: any) {
    console.error('suggest-reply PATCH error:', err)
    return NextResponse.json({ success: false, error: err?.message || 'Internal error' }, { status: 500 })
  }
}
