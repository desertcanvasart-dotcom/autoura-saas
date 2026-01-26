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
    
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id, full_name')
      .eq('phone', phoneNumber)
      .single()

    if (existingClient) {
      clientId = existingClient.id
      clientName = existingClient.full_name
    }

    // ============================================
    // STEP 2: Find or create conversation
    // ============================================
    let conversationId = null
    
    const { data: existingConversation } = await supabase
      .from('whatsapp_conversations')
      .select('id')
      .eq('phone_number', phoneNumber)
      .single()

    if (existingConversation) {
      conversationId = existingConversation.id
      
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
          status: 'active'
        })
        .select()
        .single()

      if (convError) {
        console.error('❌ Error creating conversation:', convError)
      } else {
        conversationId = newConversation.id
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
    // STEP 4: Auto-respond to common queries
    // ============================================
    const lowerBody = body?.toLowerCase() || ''
    
    if (lowerBody.includes('booking') || lowerBody.includes('quote') || lowerBody.includes('reservation')) {
      // Find recent itineraries for this client or phone number
      let itineraryQuery = supabase
        .from('itineraries')
        .select('id, tour_name, start_date, status')
        .order('created_at', { ascending: false })
        .limit(1)

      // Search by client_id if available, otherwise try phone
      if (clientId) {
        itineraryQuery = itineraryQuery.eq('client_id', clientId)
      } else {
        itineraryQuery = itineraryQuery.eq('client_phone', phoneNumber)
      }

      const { data: itineraries } = await itineraryQuery

      if (itineraries && itineraries.length > 0) {
        const itinerary = itineraries[0]
        const businessName = process.env.BUSINESS_NAME || 'Travel2Egypt'
        
        const autoResponse = `Thank you for your message! 😊\n\n` +
          `Your most recent booking:\n` +
          `🎯 ${itinerary.tour_name}\n` +
          `📅 ${new Date(itinerary.start_date).toLocaleDateString()}\n` +
          `📋 Status: ${itinerary.status}\n\n` +
          `Our team will respond to your inquiry shortly. For urgent matters, please call us directly.\n\n` +
          `Best regards,\n${businessName} Team`

        // TODO: Uncomment to enable auto-responses via Twilio
        // await sendAutoResponse(phoneNumber, autoResponse, conversationId, supabase)
        console.log('💬 Auto-response prepared (not sent):', autoResponse.substring(0, 100) + '...')
      }
    }

    // Check for greeting keywords
    if (lowerBody.match(/^(hi|hello|hola|مرحبا|bonjour|hey)[\s!]?$/i)) {
      const businessName = process.env.BUSINESS_NAME || 'Travel2Egypt'
      const greetingResponse = `Hello! 👋 Welcome to ${businessName}.\n\n` +
        `How can we help you today?\n\n` +
        `• Type "booking" to check your reservation\n` +
        `• Type "quote" to request a new quote\n` +
        `• Or just tell us what you need!\n\n` +
        `Our team typically responds within 30 minutes during business hours.`
      
      console.log('💬 Greeting prepared (not sent):', greetingResponse.substring(0, 100) + '...')
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

// ============================================
// HELPER: Send auto-response (uncomment to enable)
// ============================================
// async function sendAutoResponse(
//   toPhone: string, 
//   message: string, 
//   conversationId: string,
//   supabase: any
// ) {
//   try {
//     const twilio = require('twilio')(
//       process.env.TWILIO_ACCOUNT_SID,
//       process.env.TWILIO_AUTH_TOKEN
//     )
//     
//     const twilioMessage = await twilio.messages.create({
//       body: message,
//       from: process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886',
//       to: `whatsapp:${toPhone}`
//     })
//     
//     // Store outbound message
//     await supabase.from('whatsapp_messages').insert({
//       conversation_id: conversationId,
//       message_sid: twilioMessage.sid,
//       direction: 'outbound',
//       message_body: message,
//       status: twilioMessage.status,
//       sent_at: new Date().toISOString()
//     })
//     
//     console.log('✅ Auto-response sent:', twilioMessage.sid)
//   } catch (error) {
//     console.error('❌ Failed to send auto-response:', error)
//   }
// }

// GET endpoint for webhook verification
export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'WhatsApp webhook endpoint is active',
    webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/webhook`,
    features: [
      'Conversation-based message storage',
      'Auto client matching',
      'Keyword detection (booking, quote, greetings)',
      'Media support'
    ]
  })
}

// ============================================
// TWILIO WEBHOOK SETUP INSTRUCTIONS
// ============================================
// 
// 1. In Twilio Console, go to:
//    Messaging → Try it out → WhatsApp sandbox settings
// 
// 2. Set "When a message comes in" webhook to:
//    https://yourdomain.com/api/whatsapp/webhook
//    (For local testing, use ngrok: https://ngrok.com)
// 
// 3. For local development with ngrok:
//    - Install ngrok: npm install -g ngrok
//    - Run: ngrok http 3000
//    - Use the https URL: https://abc123.ngrok.io/api/whatsapp/webhook
// 
// ============================================
// DATABASE SCHEMA (NEW)
// ============================================
// 
// whatsapp_conversations:
//   - id UUID PRIMARY KEY
//   - phone_number VARCHAR(50) UNIQUE
//   - client_id UUID REFERENCES clients(id)
//   - client_name VARCHAR(255)
//   - last_message TEXT (auto-updated by trigger)
//   - last_message_at TIMESTAMP (auto-updated by trigger)
//   - unread_count INTEGER (auto-updated by trigger)
//   - status VARCHAR(20): active, archived, blocked
//
// whatsapp_messages:
//   - id UUID PRIMARY KEY
//   - conversation_id UUID REFERENCES whatsapp_conversations(id)
//   - message_sid VARCHAR(255) UNIQUE
//   - direction: inbound, outbound
//   - message_body TEXT
//   - media_url TEXT
//   - media_type VARCHAR(50)
//   - status: queued, sent, delivered, read, failed
//   - sent_at TIMESTAMP
// 
// ============================================
// WEBHOOK PAYLOAD EXAMPLE
// ============================================
// {
//   "MessageSid": "SM1234567890",
//   "From": "whatsapp:+201234567890",
//   "To": "whatsapp:+14155238886",
//   "Body": "Hello, I have a question about my booking",
//   "NumMedia": "0",
//   "MediaUrl0": "https://...", (if media attached)
//   "MediaContentType0": "image/jpeg", (if media attached)
//   "FromCity": "Cairo",
//   "FromCountry": "EG"
// }
// ============================================
