import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'
import { indexWhatsAppReply } from '@/lib/copilot-indexer'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

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
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({
        error: authResult.error
      }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult

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
          .insert({ tenant_id, phone_number: cleanPhone })
          .select()
          .single()

        if (convError) throw convError
        convId = newConv.id
      }
      toPhone = cleanPhone
    }

    const formattedPhone = toPhone.startsWith('+') ? toPhone : `+${toPhone}`

    // Send via the active provider (Twilio or Meta Cloud API)
    const sendResult = await sendWhatsAppMessage({
      to: formattedPhone,
      body: message,
      statusCallback: `${process.env.NEXT_PUBLIC_APP_URL || "https://autoura.net"}/api/whatsapp/status-callback`
    })

    if (!sendResult.success || !sendResult.messageId) {
      throw new Error(sendResult.error || 'Failed to send WhatsApp message')
    }

    // Store in database
    const { data: savedMessage, error: saveError } = await supabase
      .from('whatsapp_messages')
      .insert({
        tenant_id,
        conversation_id: convId,
        message_sid: sendResult.messageId,
        direction: 'outbound',
        message_body: message,
        status: 'sent',
        sent_at: new Date().toISOString(),
        // Attribution (mig 269): the staff member sending. The webhook
        // auto-reply and AI agent leave this null on purpose.
        sent_by: authResult.user!.id
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
      // Provider message id (Twilio SID or Meta wamid). The twilio_sid key
      // is kept for existing UI callers.
      message_id: sendResult.messageId,
      twilio_sid: sendResult.messageId
    })
  } catch (error: any) {
    console.error('Error sending message:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
