// app/api/conversations/[id]/route.ts
// Single unified conversation - Get details, messages, update, delete

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createAuthenticatedClient()
    const { searchParams } = new URL(request.url)

    const includeMessages = searchParams.get('include_messages') !== 'false'
    const messagesLimit = parseInt(searchParams.get('messages_limit') || '100')

    // Get conversation details
    const { data: conversation, error: convError } = await supabase
      .from('unified_conversations')
      .select(`
        *,
        client:clients(id, full_name, email, phone, nationality, language, preferences),
        assigned_to:team_members(id, name, email, phone)
      `)
      .eq('id', id)
      .single()

    if (convError) {
      if (convError.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'Conversation not found' },
          { status: 404 }
        )
      }
      throw convError
    }

    let messages: any[] = []

    if (includeMessages) {
      // Get WhatsApp messages if linked
      if (conversation.whatsapp_conversation_id) {
        const { data: waMessages, error: waError } = await supabase
          .from('whatsapp_messages')
          .select('*')
          .eq('conversation_id', conversation.whatsapp_conversation_id)
          .order('sent_at', { ascending: true })
          .limit(messagesLimit)

        if (!waError && waMessages) {
          messages.push(...waMessages.map(m => ({
            ...m,
            channel: 'whatsapp',
            message_at: m.sent_at,
            content: m.message_text
          })))
        }
      }

      // Get email messages
      const { data: emailMessages, error: emailError } = await supabase
        .from('email_messages')
        .select('*')
        .eq('unified_conversation_id', id)
        .order('sent_at', { ascending: true })
        .limit(messagesLimit)

      if (!emailError && emailMessages) {
        messages.push(...emailMessages.map(m => ({
          ...m,
          channel: 'email',
          message_at: m.sent_at,
          content: m.body_text || m.snippet
        })))
      }

      // Sort all messages by timestamp
      messages.sort((a, b) =>
        new Date(a.message_at).getTime() - new Date(b.message_at).getTime()
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        ...conversation,
        messages
      }
    })
  } catch (error: any) {
    console.error('Get conversation error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createAuthenticatedClient()
    const body = await request.json()

    const allowedUpdates = [
      'status',
      'is_starred',
      'tags',
      'assigned_team_member_id',
      'client_id',
      'contact_name',
      'contact_email',
      'contact_phone'
    ]

    // Filter to allowed fields only
    const updates: Record<string, any> = {}
    for (const key of allowedUpdates) {
      if (body[key] !== undefined) {
        updates[key] = body[key]
      }
    }

    // Handle special actions
    if (body.action === 'mark_read') {
      updates.unread_messages = 0

      // Also mark WhatsApp messages as read
      const { data: conv } = await supabase
        .from('unified_conversations')
        .select('whatsapp_conversation_id')
        .eq('id', id)
        .single()

      if (conv?.whatsapp_conversation_id) {
        await supabase
          .from('whatsapp_messages')
          .update({ status: 'read', read_at: new Date().toISOString() })
          .eq('conversation_id', conv.whatsapp_conversation_id)
          .eq('direction', 'inbound')
          .neq('status', 'read')
      }

      // Mark emails as read
      await supabase
        .from('email_messages')
        .update({ is_read: true })
        .eq('unified_conversation_id', id)
        .eq('direction', 'inbound')
        .eq('is_read', false)
    }

    if (body.action === 'archive') {
      updates.status = 'archived'
    }

    if (body.action === 'unarchive') {
      updates.status = 'active'
    }

    if (body.action === 'star') {
      updates.is_starred = true
    }

    if (body.action === 'unstar') {
      updates.is_starred = false
    }

    // Set assigned_at if assigning
    if (updates.assigned_team_member_id !== undefined) {
      if (updates.assigned_team_member_id) {
        updates.assigned_at = new Date().toISOString()
      } else {
        updates.assigned_at = null
      }
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('unified_conversations')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        client:clients(id, full_name, email, phone),
        assigned_to:team_members(id, name, email)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: any) {
    console.error('Update conversation error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createAuthenticatedClient()

    // Soft delete by archiving
    const { error } = await supabase
      .from('unified_conversations')
      .update({
        status: 'archived',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: 'Conversation archived'
    })
  } catch (error: any) {
    console.error('Delete conversation error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
