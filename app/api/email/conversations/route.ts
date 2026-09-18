// ============================================
// GET /api/email/conversations
// Lists email-only threads for the current tenant, read from the canonical
// unified_conversations table (migration 125 schema). Shaped to match what
// the /communications UI expects from the old email_conversations table.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { waitingSince } from '@/lib/email/automated-senders'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error || !authResult.supabase || !authResult.tenant_id) {
      return NextResponse.json({ error: authResult.error || 'Unauthorized', success: false }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'active'
    const search = searchParams.get('search') || ''
    const clientId = searchParams.get('client_id')

    let query = supabase
      .from('unified_conversations')
      .select(`
        id,
        contact_name,
        contact_email,
        last_message_at,
        last_message_preview,
        total_messages,
        unread_messages,
        status,
        is_starred,
        awaiting_reply_since,
        client:clients(id, first_name, last_name, email)
      `)
      .eq('tenant_id', tenant_id)
      .eq('status', status === 'archived' ? 'archived' : 'active')
      .not('contact_email', 'is', null)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(100)

    if (clientId) query = query.eq('client_id', clientId)
    // Only the conversations waiting on US (migration 366). Not the same as
    // unread: a message someone opened and did not answer is exactly the one
    // that goes missing.
    if (searchParams.get('awaiting') === 'true') query = query.not('awaiting_reply_since', 'is', null)
    if (search) query = query.or(`contact_email.ilike.%${search}%,contact_name.ilike.%${search}%`)

    const { data, error } = await query
    if (error) throw error

    // Shape each row to match the fields the UI expects
    const conversations = (data || []).map((c: any) => ({
      id: c.id,
      thread_id: c.id, // legacy alias
      client_email: c.contact_email,
      client_name: c.contact_name,
      subject: '',
      last_message_snippet: c.last_message_preview,
      last_message_at: c.last_message_at,
      unread_count: c.unread_messages || 0,
      status: c.status,
      is_starred: c.is_starred,
      // A robot is not waiting for an answer (lib/email/automated-senders).
      awaiting_reply_since: waitingSince(c.contact_email, c.awaiting_reply_since),
      client: c.client
        ? { ...c.client, full_name: `${c.client.first_name || ''} ${c.client.last_name || ''}`.trim() }
        : null,
    }))

    // ...so the "waiting on us" filter shows only the people actually waiting.
    const visible = searchParams.get('awaiting') === 'true'
      ? conversations.filter(c => c.awaiting_reply_since)
      : conversations

    return NextResponse.json({ conversations: visible, success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
}

// PATCH - Mark read / star / archive on a conversation
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error || !authResult.supabase || !authResult.tenant_id) {
      return NextResponse.json({ error: authResult.error || 'Unauthorized', success: false }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult

    const body = await request.json().catch(() => ({}))
    const conversationId: string | undefined = body.conversation_id
    const action: string | undefined = body.action

    if (!conversationId || !action) {
      return NextResponse.json({ error: 'conversation_id and action required', success: false }, { status: 400 })
    }

    let patch: Record<string, any> = {}
    if (action === 'mark_read') {
      // Clear unread count + mark any inbound messages as read
      await supabase
        .from('email_messages')
        .update({ is_read: true })
        .eq('tenant_id', tenant_id)
        .eq('unified_conversation_id', conversationId)
        .eq('direction', 'inbound')
        .eq('is_read', false)
      patch.unread_messages = 0
    } else if (action === 'archive') {
      patch.status = 'archived'
    } else if (action === 'unarchive') {
      patch.status = 'active'
    } else if (action === 'star') {
      patch.is_starred = true
    } else if (action === 'unstar') {
      patch.is_starred = false
    } else {
      return NextResponse.json({ error: 'Invalid action', success: false }, { status: 400 })
    }

    const { error } = await supabase
      .from('unified_conversations')
      .update(patch)
      .eq('id', conversationId)
      .eq('tenant_id', tenant_id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
}
