import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// GET - Messages for a conversation
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ error: authResult.error, success: false }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ error: 'Auth failed', success: false }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversation_id')
    const threadId = searchParams.get('thread_id')
    const limit = parseInt(searchParams.get('limit') || '50')

    if (!conversationId && !threadId) return NextResponse.json({ error: 'conversation_id or thread_id required', success: false }, { status: 400 })

    let query = supabase.from('email_messages').select('*').order('sent_at', { ascending: false }).limit(limit)
    if (conversationId) query = query.eq('conversation_id', conversationId)
    else if (threadId) query = query.eq('thread_id', threadId)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ messages: (data || []).reverse(), success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
}

// POST - Store a new message
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ error: authResult.error, success: false }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ error: 'Auth failed', success: false }, { status: 401 })

    const body = await request.json()
    const { conversation_id, message_id, thread_id, direction, from_address, to_addresses, cc_addresses, subject, body_text, body_html, snippet, attachments, sent_at, is_read, labels } = body

    if (!message_id || !thread_id || !direction || !from_address || !sent_at) {
      return NextResponse.json({ error: 'message_id, thread_id, direction, from_address, sent_at required', success: false }, { status: 400 })
    }

    // Dedup
    const { data: existing } = await supabase.from('email_messages').select('id').eq('message_id', message_id).single()
    if (existing) return NextResponse.json({ message: existing, created: false, success: true })

    let finalConvId = conversation_id
    if (!finalConvId) {
      const { data: conv } = await supabase.from('email_conversations').select('id').eq('thread_id', thread_id).single()
      if (conv) finalConvId = conv.id
    }

    const { data, error } = await supabase.from('email_messages').insert({
      conversation_id: finalConvId || null, message_id, thread_id, direction, from_address,
      to_addresses: to_addresses || [], cc_addresses: cc_addresses || null, subject,
      body_text, body_html, snippet, attachments: attachments || [],
      is_read: is_read ?? (direction === 'outbound'), is_starred: false, labels, sent_at,
      received_at: direction === 'inbound' ? new Date().toISOString() : null,
    }).select().single()

    if (error) throw error
    return NextResponse.json({ message: data, created: true, success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
}

// PATCH - Update message (read/star)
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ error: authResult.error, success: false }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ error: 'Auth failed', success: false }, { status: 401 })

    const body = await request.json()
    const { message_id, action } = body
    if (!message_id) return NextResponse.json({ error: 'message_id required', success: false }, { status: 400 })

    let updateData: any = {}
    if (action === 'mark_read') updateData.is_read = true
    else if (action === 'mark_unread') updateData.is_read = false
    else if (action === 'star') updateData.is_starred = true
    else if (action === 'unstar') updateData.is_starred = false

    const { data, error } = await supabase.from('email_messages').update(updateData).eq('message_id', message_id).select().single()
    if (error) throw error

    // Recalculate unread count
    if (action === 'mark_read' && data.conversation_id) {
      const { count } = await supabase.from('email_messages').select('*', { count: 'exact', head: true }).eq('conversation_id', data.conversation_id).eq('direction', 'inbound').eq('is_read', false)
      await supabase.from('email_conversations').update({ unread_count: count || 0 }).eq('id', data.conversation_id)
    }

    return NextResponse.json({ message: data, success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
}

// PUT - Batch store messages
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ error: authResult.error, success: false }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ error: 'Auth failed', success: false }, { status: 401 })

    const { messages } = await request.json()
    if (!messages?.length) return NextResponse.json({ error: 'Messages array required', success: false }, { status: 400 })

    const messageIds = messages.map((m: any) => m.message_id)
    const { data: existing } = await supabase.from('email_messages').select('message_id').in('message_id', messageIds)
    const existingIds = new Set((existing || []).map((m: any) => m.message_id))
    const newMsgs = messages.filter((m: any) => !existingIds.has(m.message_id))

    if (newMsgs.length === 0) return NextResponse.json({ inserted: 0, skipped: messages.length, success: true })

    const { data, error } = await supabase.from('email_messages').insert(
      newMsgs.map((m: any) => ({
        conversation_id: m.conversation_id || null, message_id: m.message_id, thread_id: m.thread_id,
        direction: m.direction, from_address: m.from_address, to_addresses: m.to_addresses || [],
        cc_addresses: m.cc_addresses || null, subject: m.subject, body_text: m.body_text, body_html: m.body_html,
        snippet: m.snippet, attachments: m.attachments || [],
        is_read: m.is_read ?? (m.direction === 'outbound'), is_starred: false, labels: m.labels, sent_at: m.sent_at,
      }))
    ).select()
    if (error) throw error

    return NextResponse.json({ inserted: data?.length || 0, skipped: messages.length - (data?.length || 0), success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
}
