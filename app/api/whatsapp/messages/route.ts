import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { indexWhatsAppReply } from '@/lib/copilot-indexer'
import twilio from 'twilio'

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'

// GET /api/whatsapp/messages - Get messages for a conversation
export async function GET(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - protects conversation data
    const supabase = await createAuthenticatedClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversation_id')
    const limit = parseInt(searchParams.get('limit') || '50')
    const before = searchParams.get('before') // For pagination

    if (!conversationId) {
      return NextResponse.json({ error: 'Conversation ID required' }, { status: 400 })
    }

    let query = supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: false })
      .limit(limit)

    if (before) {
      query = query.lt('sent_at', before)
    }

    const { data, error } = await query

    if (error) throw error

    // Return in chronological order for display
    const messages = (data || []).reverse()

    return NextResponse.json({ messages })
  } catch (error: any) {
    console.error('Error fetching messages:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/whatsapp/messages - Send a new message
export async function POST(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - prevents SMS spam abuse
    const supabase = await createAuthenticatedClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const body = await request.json()
    const { conversation_id, phone_number, message } = body

    if (!message || (!conversation_id && !phone_number)) {
      return NextResponse.json({
        error: 'Message and either conversation_id or phone_number required'
      }, { status: 400 })
    }

    // Get or create conversation
    let convId = conversation_id
    let toPhone = phone_number

    if (conversation_id && !phone_number) {
      const { data: conv } = await supabase
        .from('whatsapp_conversations')
        .select('phone_number')
        .eq('id', conversation_id)
        .single()

      if (!conv) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      }
      toPhone = conv.phone_number
    }

    if (!conversation_id && phone_number) {
      // Create conversation if needed
      const cleanPhone = phone_number.replace(/[^\d+]/g, '')
      const { data: existing } = await supabase
        .from('whatsapp_conversations')
        .select('id')
        .eq('phone_number', cleanPhone)
        .single()

      if (existing) {
        convId = existing.id
      } else {
        const { data: newConv, error: convError } = await supabase
          .from('whatsapp_conversations')
          .insert({ phone_number: cleanPhone })
          .select()
          .single()

        if (convError) throw convError
        convId = newConv.id
      }
      toPhone = cleanPhone
    }

    // Format phone number for Twilio
    const formattedPhone = toPhone.startsWith('+') ? toPhone : `+${toPhone}`

    // Send via Twilio
    const twilioMessage = await twilioClient.messages.create({
      body: message,
      from: TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${formattedPhone}`,
      statusCallback: `${process.env.NEXT_PUBLIC_APP_URL || "https://autoura.net"}/api/whatsapp/status-callback`
    })

    // Store in database
    const { data: savedMessage, error: saveError } = await supabase
      .from('whatsapp_messages')
      .insert({
        conversation_id: convId,
        message_sid: twilioMessage.sid,
        direction: 'outbound',
        message_body: message,
        status: twilioMessage.status,
        sent_at: new Date().toISOString()
      })
      .select()
      .single()

    if (saveError) throw saveError

    // Auto-index this agent reply into the copilot knowledge base so future
    // suggestions can learn from it. Non-fatal on failure.
    if (savedMessage?.tenant_id && savedMessage?.id) {
      await indexWhatsAppReply({
        supabase,
        tenantId: savedMessage.tenant_id,
        conversationId: convId,
        outboundMessageId: savedMessage.id,
        outboundText: message,
        outboundSentAt: savedMessage.sent_at,
        isAiGenerated: false,
      }).catch(() => {})
    }

    return NextResponse.json({
      success: true,
      message: savedMessage,
      twilio_sid: twilioMessage.sid
    })
  } catch (error: any) {
    console.error('Error sending message:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
