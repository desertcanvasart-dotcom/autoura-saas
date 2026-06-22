// GET /api/copilot/threads/[id] — full thread detail for the review panel:
// the inbound message(s), the draft(s), and the client context card.
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { buildCopilotContext } from '@/lib/copilot-context'
import type { CopilotThreadSummary } from '@/app/types/copilot'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createAuthenticatedClient()

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const { data: thread, error: tErr } = await supabase
      .from('communication_threads')
      .select('*')
      .eq('id', id)
      .single()
    if (tErr || !thread) {
      return NextResponse.json({ success: false, error: 'Thread not found' }, { status: 404 })
    }

    const { data: inbox } = await supabase
      .from('communication_inbox')
      .select('*')
      .eq('thread_id', id)
      .order('received_at', { ascending: true })

    const { data: drafts } = await supabase
      .from('communication_drafts')
      .select('*')
      .eq('thread_id', id)
      .order('created_at', { ascending: false })

    const context = await buildCopilotContext(supabase, (thread as any).client_id)

    const latestInbox = (inbox || [])[inbox && inbox.length ? inbox.length - 1 : 0]
    const pending = (drafts || []).filter((d: any) => d.status === 'pending').length
    const summary: CopilotThreadSummary = {
      id: (thread as any).id,
      channel: (thread as any).channel,
      client_id: (thread as any).client_id,
      client_name: (thread as any).client_name,
      contact_info: (thread as any).contact_info,
      subject: (thread as any).subject,
      status: (thread as any).status,
      urgency: (thread as any).urgency,
      last_message_at: (thread as any).last_message_at,
      last_draft_at: (thread as any).last_draft_at,
      latest_inbox_snippet: latestInbox ? (latestInbox.message_snippet || (latestInbox.message_body || '').slice(0, 140)) : null,
      latest_inbox_status: latestInbox ? latestInbox.status : null,
      pending_draft_count: pending,
    }

    return NextResponse.json({ success: true, thread: summary, inbox: inbox || [], drafts: drafts || [], context })
  } catch (e: any) {
    console.error('copilot thread detail error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
