// ============================================
// API: WHATSAPP WEBHOOK HANDLER
// ============================================
// POST /api/whatsapp/webhook
// Receives incoming WhatsApp messages from Twilio
// Stores in conversation-based structure for chat UI
// SECURITY: Validates Twilio signature before processing
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'
import twilio from 'twilio'
import { processIncomingMessage } from '@/lib/whatsapp-ai-agent'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'

export async function POST(request: NextRequest) {
  try {
    // ============================================
    // SECURITY: Validate Twilio Signature
    // ============================================
    const signature = request.headers.get('x-twilio-signature')
    const url = request.url

    if (!signature) {
      console.error('❌ Missing Twilio signature header')
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { status: 403, headers: { 'Content-Type': 'text/xml' } }
      )
    }

    // Parse form data for signature validation
    const formData = await request.formData()
    const params: Record<string, string> = {}
    formData.forEach((value, key) => {
      params[key] = value.toString()
    })

    // Validate signature
    const authToken = process.env.TWILIO_AUTH_TOKEN
    if (!authToken) {
      console.error('❌ TWILIO_AUTH_TOKEN not configured')
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { status: 500, headers: { 'Content-Type': 'text/xml' } }
      )
    }

    const isValid = twilio.validateRequest(authToken, signature, url, params)

    if (!isValid) {
      console.error('❌ Invalid Twilio signature - possible unauthorized webhook')
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { status: 403, headers: { 'Content-Type': 'text/xml' } }
      )
    }

    console.log('✅ Twilio signature validated')

    // ============================================
    // Extract webhook data (already parsed above)
    // ============================================
    const from = params['From'] // e.g., "whatsapp:+201234567890"
    const to = params['To'] // Your WhatsApp number
    const body = params['Body'] // Message text
    const messageSid = params['MessageSid']
    const numMedia = parseInt(params['NumMedia'] || '0')
    const mediaUrl = params['MediaUrl0'] || null
    const mediaType = params['MediaContentType0'] || null

    console.log('📥 Received WhatsApp message:', {
      from,
      to,
      messageSid,
      body: body?.substring(0, 50) + '...',
      hasMedia: numMedia > 0
    })

    // Extract phone number (remove "whatsapp:" prefix)
    const phoneNumber = from.replace('whatsapp:', '')
    const toNumber = to.replace('whatsapp:', '')

    const supabase = createClient()
    
    // ============================================
    // STEP 1: Find or create client
    // ============================================
    let clientId = null
    let clientName = null
    let clientTenantId = null

    const { data: existingClient } = await supabase
      .from('clients')
      .select('id, full_name, tenant_id')
      .eq('phone', phoneNumber)
      .single()

    if (existingClient) {
      clientId = existingClient.id
      clientName = existingClient.full_name
      clientTenantId = existingClient.tenant_id
    }

    // ============================================
    // STEP 2: Find or create conversation
    // ============================================
    let conversationId = null
    let tenantId = null

    const { data: existingConversation } = await supabase
      .from('whatsapp_conversations')
      .select('id, tenant_id')
      .eq('phone_number', phoneNumber)
      .single()

    if (existingConversation) {
      conversationId = existingConversation.id
      tenantId = existingConversation.tenant_id

      // Update conversation with client info if we found one and it wasn't linked
      if (clientId) {
        await supabase
          .from('whatsapp_conversations')
          .update({
            client_id: clientId,
            client_name: clientName,
            updated_at: new Date().toISOString()
          })
          .eq('id', conversationId)
          .is('client_id', null) // Only update if not already linked
      }
    } else {
      // Create new conversation
      const { data: newConversation, error: convError } = await supabase
        .from('whatsapp_conversations')
        .insert({
          phone_number: phoneNumber,
          client_id: clientId,
          client_name: clientName,
          tenant_id: clientTenantId, // Use client's tenant if available
          status: 'active'
        })
        .select('id, tenant_id')
        .single()

      if (convError) {
        console.error('❌ Error creating conversation:', convError)
      } else {
        conversationId = newConversation.id
        tenantId = newConversation.tenant_id || clientTenantId
        console.log('✅ Created new conversation:', conversationId)
      }
    }

    // ============================================
    // STEP 3: Store the incoming message
    // ============================================
    const { error: msgError } = await supabase
      .from('whatsapp_messages')
      .insert({
        conversation_id: conversationId,
        message_sid: messageSid,
        direction: 'inbound',
        message_body: body,
        media_url: mediaUrl,
        media_type: mediaType,
        status: 'delivered',
        sent_at: new Date().toISOString()
      })

    if (msgError) {
      console.error('❌ Error storing message:', msgError)
    } else {
      console.log('✅ Message stored successfully')
    }

    // ============================================
    // STEP 3b: Mirror into communication_threads + communication_inbox
    // (powers the AI copilot — feature-flagged via COPILOT_ENABLED)
    // ============================================
    if (tenantId && conversationId && body) {
      try {
        const receivedAt = new Date().toISOString()
        const snippet = body.length > 140 ? body.slice(0, 137) + '...' : body

        const { data: existingThread } = await supabase
          .from('communication_threads')
          .select('id, message_count')
          .eq('tenant_id', tenantId)
          .eq('channel', 'whatsapp')
          .eq('whatsapp_conversation_id', conversationId)
          .maybeSingle()

        let threadId: string | null = existingThread?.id ?? null

        if (threadId) {
          await supabase
            .from('communication_threads')
            .update({
              last_message_at: receivedAt,
              message_count: (existingThread?.message_count ?? 0) + 1,
              status: 'open',
              client_id: clientId,
              client_name: clientName,
            })
            .eq('id', threadId)
        } else {
          const { data: newThread, error: threadErr } = await supabase
            .from('communication_threads')
            .insert({
              tenant_id: tenantId,
              channel: 'whatsapp',
              whatsapp_conversation_id: conversationId,
              client_id: clientId,
              client_name: clientName,
              contact_info: phoneNumber,
              status: 'open',
              urgency: 'normal',
              last_message_at: receivedAt,
              message_count: 1,
            })
            .select('id')
            .single()
          if (threadErr) {
            console.error('❌ Error creating communication_thread:', threadErr)
          } else {
            threadId = newThread.id
          }
        }

        if (threadId) {
          const { error: inboxErr } = await supabase
            .from('communication_inbox')
            .insert({
              tenant_id: tenantId,
              thread_id: threadId,
              channel: 'whatsapp',
              source_message_id: messageSid,
              sender_name: clientName,
              sender_contact: phoneNumber,
              message_body: body,
              message_snippet: snippet,
              status: 'new',
              received_at: receivedAt,
            })
          if (inboxErr && inboxErr.code !== '23505') {
            // 23505 = unique violation (duplicate webhook retry) — safe to ignore
            console.error('❌ Error creating communication_inbox row:', inboxErr)
          }
        }
      } catch (copilotErr) {
        // Never fail the webhook on copilot mirror errors
        console.error('❌ Copilot mirror error:', copilotErr)
      }
    }

    // ============================================
    // STEP 4: AI-Powered Auto-Response
    // ============================================
    // Only process if AI is globally enabled and we have a message body
    if (process.env.WHATSAPP_AI_ENABLED === 'true' && body && conversationId) {
      try {
        // Check tenant-specific AI setting
        let tenantAiEnabled = false
        if (tenantId) {
          const { data: tenantFeatures } = await supabase
            .from('tenant_features')
            .select('whatsapp_ai_enabled')
            .eq('tenant_id', tenantId)
            .single()

          tenantAiEnabled = tenantFeatures?.whatsapp_ai_enabled || false
        }

        if (!tenantAiEnabled) {
          console.log('ℹ️ AI auto-response disabled for this tenant')
        } else {
          console.log('🤖 Processing message with AI agent...')

          const aiResponse = await processIncomingMessage(
            supabase,
            conversationId,
            clientId,
            phoneNumber,
            body,
            tenantId
          )

          if (aiResponse.success && aiResponse.shouldRespond && aiResponse.reply) {
            console.log('🤖 AI response generated:', aiResponse.reply.substring(0, 100) + '...')
            console.log('🤖 Confidence:', aiResponse.confidence)

            // Send the AI-generated response
            const sendResult = await sendWhatsAppMessage({
              to: phoneNumber,
              body: aiResponse.reply
            })

            if (sendResult.success) {
              // Store the outbound message
              await supabase.from('whatsapp_messages').insert({
                conversation_id: conversationId,
                message_sid: sendResult.messageId,
                direction: 'outbound',
                message_body: aiResponse.reply,
                status: 'sent',
                sent_at: new Date().toISOString(),
                metadata: {
                  ai_generated: true,
                  ai_confidence: aiResponse.confidence,
                  ai_model: process.env.WHATSAPP_AI_MODEL || 'claude-sonnet-4-20250514',
                  tools_used: aiResponse.toolsUsed || [],
                  actions_performed: aiResponse.actionsPerformed || []
                }
              })
              console.log('✅ AI response sent and stored:', sendResult.messageId)
            } else {
              console.error('❌ Failed to send AI response:', sendResult.error)
            }
          } else {
            console.log('🤖 AI decided not to respond:', aiResponse.reasoning || aiResponse.error)
          }
        }
      } catch (aiError) {
        console.error('❌ AI processing error:', aiError)
        // Don't fail the webhook - just log the error
      }
    } else if (!process.env.WHATSAPP_AI_ENABLED) {
      console.log('ℹ️ AI auto-response disabled. Set WHATSAPP_AI_ENABLED=true to enable.')
    }

    // Respond to Twilio with 200 OK
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    )

  } catch (error: any) {
    console.error('❌ Error processing WhatsApp webhook:', error)
    // Still return 200 to Twilio to avoid retries
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    )  }
}

// GET endpoint for webhook verification
export async function GET(request: NextRequest) {
  const aiEnabled = process.env.WHATSAPP_AI_ENABLED === 'true'
  const aiToolsEnabled = process.env.WHATSAPP_AI_TOOLS_ENABLED === 'true'
  const aiModel = process.env.WHATSAPP_AI_MODEL || 'claude-sonnet-4-20250514'

  return NextResponse.json({
    success: true,
    message: 'WhatsApp webhook endpoint is active',
    webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/webhook`,
    features: [
      'Conversation-based message storage',
      'Auto client matching',
      'Media support',
      aiEnabled ? `AI auto-reply enabled (${aiModel})` : 'AI auto-reply disabled',
      aiToolsEnabled ? 'AI tools enabled (can take actions)' : 'AI tools disabled'
    ],
    ai: {
      enabled: aiEnabled,
      toolsEnabled: aiToolsEnabled,
      model: aiModel,
      envVars: {
        aiEnabled: 'WHATSAPP_AI_ENABLED=true to enable AI responses',
        toolsEnabled: 'WHATSAPP_AI_TOOLS_ENABLED=true to enable AI actions'
      },
      availableTools: aiToolsEnabled ? [
        'search_customer_trips',
        'get_quote_details',
        'create_trip_inquiry',
        'request_quote_for_trip',
        'send_quote_to_customer',
        'check_availability',
        'escalate_to_human'
      ] : []
    }
  })
}

// ============================================
// ENVIRONMENT VARIABLES
// ============================================
//
// Required for Twilio:
//   TWILIO_ACCOUNT_SID       - Twilio Account SID
//   TWILIO_AUTH_TOKEN        - Twilio Auth Token (for signature validation)
//   TWILIO_API_KEY           - Twilio API Key (for sending messages)
//   TWILIO_API_SECRET        - Twilio API Secret
//   TWILIO_WHATSAPP_FROM     - WhatsApp number (e.g., whatsapp:+14155238886)
//
// Required for AI (Optional):
//   WHATSAPP_AI_ENABLED      - Set to 'true' to enable AI auto-responses
//   WHATSAPP_AI_TOOLS_ENABLED - Set to 'true' to enable AI tool calling (Phase 2)
//   ANTHROPIC_API_KEY        - Anthropic API key for Claude
//   WHATSAPP_AI_MODEL        - Claude model ID (default: claude-sonnet-4-20250514)
//
// Business Info:
//   BUSINESS_NAME            - Your business name (default: Travel2Egypt)
//   BUSINESS_EMAIL           - Contact email for customers
//
// ============================================
// TWILIO WEBHOOK SETUP
// ============================================
//
// 1. In Twilio Console, go to:
//    Messaging → Try it out → WhatsApp sandbox settings
//
// 2. Set "When a message comes in" webhook to:
//    https://yourdomain.com/api/whatsapp/webhook
//
// ============================================
// AI AUTO-REPLY FEATURES
// ============================================
//
// When WHATSAPP_AI_ENABLED=true:
// - AI reads conversation history for context
// - Fetches customer's bookings and quotes
// - Generates personalized responses
// - Automatically skips sensitive topics (complaints, refunds)
// - Skips when customer requests human agent
// - Stores AI metadata with each message
//
// When WHATSAPP_AI_TOOLS_ENABLED=true (Phase 2):
// - AI can search customer's trips and quotes
// - AI can create new trip inquiries
// - AI can request quotes for trips
// - AI can send quote PDFs to customers
// - AI can check availability for dates
// - AI can escalate conversations to humans
//
// ============================================
