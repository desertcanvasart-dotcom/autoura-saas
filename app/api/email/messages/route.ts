// ============================================
// GET /api/email/messages?conversation_id=<unified_conversation_id>
// Returns the email messages for a given unified conversation. Shaped to
// match the fields the /communications UI's UnifiedMessageThread expects.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase || !auth.tenant_id) {
      return NextResponse.json({ error: auth.error || 'Unauthorized', success: false }, { status: auth.status })
    }
    const { supabase, tenant_id } = auth

    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversation_id')
    const threadId = searchParams.get('thread_id')
    const limit = parseInt(searchParams.get('limit') || '50')

    if (!conversationId && !threadId) {
      return NextResponse.json({ error: 'conversation_id or thread_id required', success: false }, { status: 400 })
    }

    let query = supabase
      .from('email_messages')
      .select('id, gmail_message_id, gmail_thread_id, direction, from_email, from_name, to_email, to_name, cc_emails, subject, body_text, body_html, snippet, attachments, is_read, is_starred, labels, sent_at')
      .eq('tenant_id', tenant_id)
      .order('sent_at', { ascending: false })
      .limit(limit)

    if (conversationId) query = query.eq('unified_conversation_id', conversationId)
    else if (threadId) query = query.eq('gmail_thread_id', threadId)

    const { data, error } = await query
    if (error) throw error

    // Shape to match the UI's Message interface
    const messages = (data || []).reverse().map((m: any) => ({
      id: m.id,
      message_id: m.gmail_message_id,
      direction: m.direction,
      from_address: m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email,
      to_addresses: m.to_email ? [m.to_email] : [],
      subject: m.subject || '',
      body_html: m.body_html,
      body_text: m.body_text,
      snippet: m.snippet,
      sent_at: m.sent_at,
      is_read: m.is_read,
      is_starred: m.is_starred,
      attachments: m.attachments || [],
    }))

    return NextResponse.json({ messages, success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
}

// PATCH - mark a specific message as read/unread/star/unstar
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase || !auth.tenant_id) {
      return NextResponse.json({ error: auth.error || 'Unauthorized', success: false }, { status: auth.status })
    }
    const { supabase, tenant_id } = auth

    const body = await request.json().catch(() => ({}))
    const messageId: string | undefined = body.message_id
    const action: string | undefined = body.action

    if (!messageId || !action) {
      return NextResponse.json({ error: 'message_id and action required', success: false }, { status: 400 })
    }

    const patch: Record<string, any> = {}
    if (action === 'mark_read')   patch.is_read = true
    if (action === 'mark_unread') patch.is_read = false
    if (action === 'star')        patch.is_starred = true
    if (action === 'unstar')      patch.is_starred = false

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Invalid action', success: false }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('email_messages')
      .update(patch)
      .eq('tenant_id', tenant_id)
      .eq('gmail_message_id', messageId)
      .select('id, unified_conversation_id')
      .single()

    if (error) throw error

    // If we just marked an inbound as read, recompute unread count on the unified conv
    if (action === 'mark_read' && data?.unified_conversation_id) {
      const { count } = await supabase
        .from('email_messages')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant_id)
        .eq('unified_conversation_id', data.unified_conversation_id)
        .eq('direction', 'inbound')
        .eq('is_read', false)
      await supabase
        .from('unified_conversations')
        .update({ unread_messages: count || 0 })
        .eq('id', data.unified_conversation_id)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
}
