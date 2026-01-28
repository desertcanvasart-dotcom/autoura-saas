// app/api/conversations/[id]/messages/route.ts
// Send messages (WhatsApp or Email) from unified conversation

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createAuthenticatedClient()
    const body = await request.json()

    const { channel, message, subject, attachments } = body

    if (!channel || !message) {
      return NextResponse.json(
        { success: false, error: 'Channel and message are required' },
        { status: 400 }
      )
    }

    // Get conversation details
    const { data: conversation, error: convError } = await supabase
      .from('unified_conversations')
      .select('*, whatsapp_conversation_id')
      .eq('id', id)
      .single()

    if (convError || !conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      )
    }

    let sentMessage: any = null

    if (channel === 'whatsapp') {
      // Send via WhatsApp
      if (!conversation.contact_phone) {
        return NextResponse.json(
          { success: false, error: 'No phone number for this contact' },
          { status: 400 }
        )
      }

      // Send the message via Twilio
      const result = await sendWhatsAppMessage({
        to: conversation.contact_phone,
        body: message,
        mediaUrl: attachments?.[0]?.url // Optional media
      })

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error || 'Failed to send WhatsApp message' },
          { status: 500 }
        )
      }

      // Store in whatsapp_messages if we have a conversation
      if (conversation.whatsapp_conversation_id) {
        const { data: waMessage, error: waError } = await supabase
          .from('whatsapp_messages')
          .insert({
            tenant_id: conversation.tenant_id,
            conversation_id: conversation.whatsapp_conversation_id,
            message_text: message,
            direction: 'outbound',
            status: 'sent',
            media_url: attachments?.[0]?.url || null,
            media_type: attachments?.[0]?.type || null,
            sent_at: new Date().toISOString()
          })
          .select()
          .single()

        if (!waError) {
          sentMessage = { ...waMessage, channel: 'whatsapp' }
        }
      }
    } else if (channel === 'email') {
      // Send via Gmail
      if (!conversation.contact_email) {
        return NextResponse.json(
          { success: false, error: 'No email address for this contact' },
          { status: 400 }
        )
      }

      // Get the user's Gmail token
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json(
          { success: false, error: 'Not authenticated' },
          { status: 401 }
        )
      }

      // Call the Gmail send API
      const gmailResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Forward the auth cookie
          'Cookie': request.headers.get('cookie') || ''
        },
        body: JSON.stringify({
          to: conversation.contact_email,
          subject: subject || `Message from ${conversation.contact_name || 'Tour Operator'}`,
          body: message,
          attachments: attachments
        })
      })

      const gmailResult = await gmailResponse.json()

      if (!gmailResult.success) {
        return NextResponse.json(
          { success: false, error: gmailResult.error || 'Failed to send email' },
          { status: 500 }
        )
      }

      // Store in email_messages
      const { data: emailMessage, error: emailError } = await supabase
        .from('email_messages')
        .insert({
          tenant_id: conversation.tenant_id,
          unified_conversation_id: id,
          gmail_message_id: gmailResult.data?.messageId || `local-${Date.now()}`,
          gmail_thread_id: gmailResult.data?.threadId,
          from_email: user.email || '',
          to_email: conversation.contact_email,
          subject: subject || 'No Subject',
          body_text: message,
          snippet: message.substring(0, 100),
          direction: 'outbound',
          is_read: true,
          sent_at: new Date().toISOString()
        })
        .select()
        .single()

      if (!emailError) {
        sentMessage = { ...emailMessage, channel: 'email' }
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid channel. Use "whatsapp" or "email"' },
        { status: 400 }
      )
    }

    // Update conversation stats
    await supabase.rpc('update_unified_conversation_stats', { p_unified_id: id })

    return NextResponse.json({
      success: true,
      data: sentMessage,
      message: `Message sent via ${channel}`
    })
  } catch (error: any) {
    console.error('Send message error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
