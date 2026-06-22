// POST /api/copilot/drafts/[id]/send — operator-approved dispatch.
//   WhatsApp: sends immediately via Twilio, marks the draft sent + thread resolved.
//   Email:    approves the draft and hands off to the Inbox composer (gmail-
//             threaded sending lives there); avoids fragile server-side email send.
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase || !auth.tenant_id || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase, tenant_id, user } = auth
    const { id } = await params

    const body = await request.json().catch(() => ({}))
    const editedBody: string = typeof body.edited_body === 'string' ? body.edited_body.trim() : ''

    const { data: draft, error: dErr } = await supabase
      .from('communication_drafts')
      .select('id, tenant_id, thread_id, inbox_message_id, draft_body, edited_body, status')
      .eq('id', id)
      .single()
    if (dErr || !draft || draft.tenant_id !== tenant_id) {
      return NextResponse.json({ success: false, error: 'Draft not found' }, { status: 404 })
    }
    if (draft.status === 'sent') {
      return NextResponse.json({ success: false, error: 'Draft already sent' }, { status: 409 })
    }

    const { data: thread, error: tErr } = await supabase
      .from('communication_threads')
      .select('id, channel, contact_info')
      .eq('id', draft.thread_id)
      .single()
    if (tErr || !thread) {
      return NextResponse.json({ success: false, error: 'Thread not found' }, { status: 404 })
    }

    const finalBody = (editedBody || draft.edited_body || draft.draft_body || '').trim()
    if (!finalBody) {
      return NextResponse.json({ success: false, error: 'Cannot send an empty message' }, { status: 400 })
    }
    const nowIso = new Date().toISOString()
    const editPatch = editedBody ? { edited_body: editedBody, was_edited: true } : {}

    if (thread.channel === 'whatsapp') {
      const res = await sendWhatsAppMessage({ to: thread.contact_info, body: finalBody })
      if (!res.success) {
        await supabase.from('communication_drafts').update({ send_error: res.error || 'send failed', ...editPatch }).eq('id', id)
        return NextResponse.json({ success: false, error: res.error || 'Failed to send WhatsApp message' }, { status: 502 })
      }
      await supabase.from('communication_drafts').update({
        status: 'sent', sent_at: nowIso, send_channel: 'whatsapp', send_message_id: res.messageId || null,
        send_error: null, reviewed_by: user.id, reviewed_at: nowIso, ...editPatch,
      }).eq('id', id)
      await supabase.from('communication_inbox').update({ status: 'responded', processed_at: nowIso }).eq('id', draft.inbox_message_id)
      await supabase.from('communication_threads').update({ status: 'resolved' }).eq('id', thread.id)
      return NextResponse.json({ success: true, sent: true, message_id: res.messageId || null })
    }

    // Email — approve and hand off to the Inbox composer for threaded sending.
    await supabase.from('communication_drafts').update({
      status: 'approved', reviewed_by: user.id, reviewed_at: nowIso, ...editPatch,
    }).eq('id', id)
    return NextResponse.json({
      success: true,
      sent: false,
      requiresManualSend: true,
      message: 'Draft approved. Open the conversation in the Inbox to send the email reply.',
    })
  } catch (e: any) {
    console.error('copilot draft send error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
