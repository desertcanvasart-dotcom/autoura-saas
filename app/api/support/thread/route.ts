// Tenant support thread — returns the tenant's newest OPEN conversation and
// its messages, creating nothing. (The first message creates the thread —
// see POST /api/support/messages — so merely opening the widget leaves no
// empty conversations behind.)
//
// Runs entirely on the caller's RLS client: migration 261's policies are the
// tenant boundary, and this route adds no service-role power on top.

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function GET() {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    }

    const { data: conversation, error: convError } = await supabase
      .from('support_conversations')
      .select('id, status, created_at, last_message_at')
      .eq('status', 'open')
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (convError) {
      return NextResponse.json({ success: false, error: convError.message }, { status: 500 })
    }

    if (!conversation) {
      return NextResponse.json({ success: true, conversation: null, messages: [] })
    }

    const { data: messages, error: msgError } = await supabase
      .from('support_messages')
      .select('id, sender_type, body, created_at')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(200)
    if (msgError) {
      return NextResponse.json({ success: false, error: msgError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, conversation, messages: messages || [] })
  } catch (error) {
    console.error('Support thread GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
