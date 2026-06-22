// GET /api/copilot/threads — the review queue: open threads that have a
// pending draft or an inbound awaiting review. RLS scopes to the tenant.
import { NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import type { CopilotThreadSummary } from '@/app/types/copilot'

const ACTIONABLE = new Set(['new', 'draft_pending', 'draft_ready'])

export async function GET() {
  try {
    const supabase = await createAuthenticatedClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    // Latest inbox row per thread
    const { data: inboxRows } = await supabase
      .from('communication_inbox')
      .select('thread_id, message_snippet, message_body, status, received_at')
      .order('received_at', { ascending: false })
      .limit(400)
    const latestByThread = new Map<string, any>()
    for (const r of inboxRows || []) {
      if (!latestByThread.has(r.thread_id)) latestByThread.set(r.thread_id, r)
    }

    // Pending draft counts per thread
    const { data: pendingDrafts } = await supabase
      .from('communication_drafts')
      .select('thread_id')
      .eq('status', 'pending')
      .limit(1000)
    const pendingByThread = new Map<string, number>()
    for (const d of pendingDrafts || []) {
      pendingByThread.set(d.thread_id, (pendingByThread.get(d.thread_id) || 0) + 1)
    }

    const { data: threads } = await supabase
      .from('communication_threads')
      .select('id, channel, client_id, client_name, contact_info, subject, status, urgency, last_message_at, last_draft_at')
      .in('status', ['open', 'waiting'])
      .order('last_message_at', { ascending: false })
      .limit(200)

    const summaries: CopilotThreadSummary[] = (threads || [])
      .map((t: any): CopilotThreadSummary => {
        const inb = latestByThread.get(t.id)
        return {
          id: t.id,
          channel: t.channel,
          client_id: t.client_id,
          client_name: t.client_name,
          contact_info: t.contact_info,
          subject: t.subject,
          status: t.status,
          urgency: t.urgency,
          last_message_at: t.last_message_at,
          last_draft_at: t.last_draft_at,
          latest_inbox_snippet: inb ? (inb.message_snippet || (inb.message_body || '').slice(0, 140)) : null,
          latest_inbox_status: inb ? inb.status : null,
          pending_draft_count: pendingByThread.get(t.id) || 0,
        }
      })
      .filter(s => s.pending_draft_count > 0 || (s.latest_inbox_status != null && ACTIONABLE.has(s.latest_inbox_status)))

    summaries.sort((a, b) =>
      (b.pending_draft_count - a.pending_draft_count) ||
      (new Date(b.last_draft_at || b.last_message_at || 0).getTime() - new Date(a.last_draft_at || a.last_message_at || 0).getTime())
    )

    return NextResponse.json({ success: true, threads: summaries })
  } catch (e: any) {
    console.error('copilot threads GET error:', e?.message)
    return NextResponse.json({ success: true, threads: [] })
  }
}
