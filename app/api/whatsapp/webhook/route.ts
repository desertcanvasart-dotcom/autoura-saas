// ============================================
// API: WHATSAPP WEBHOOK HANDLER (dual-provider)
// ============================================
// POST /api/whatsapp/webhook
// Receives incoming WhatsApp messages from EITHER:
//   - Twilio (form-encoded, X-Twilio-Signature)            — legacy/default
//   - Meta Cloud API (JSON, X-Hub-Signature-256)           — direct
// The two are distinguished per-request by headers/content-type, so both
// can be live at once during the migration window.
// Meta also delivers delivery-status updates on this same URL (Twilio uses
// the separate /api/whatsapp/status-callback route).
// SECURITY: validates the provider signature before processing.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createClient } from '@/app/supabase'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { processIncomingMessage } from '@/lib/whatsapp-ai-agent'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import {
  verifyMetaSignature,
  parseMetaWebhook,
  fetchMetaMedia,
  type MetaStatusUpdate
} from '@/lib/whatsapp-cloud-api'
import { generateDraftReplies } from '@/lib/copilot-suggest'

const TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

function twimlResponse(status: number) {
  return new NextResponse(TWIML_EMPTY, {
    status,
    headers: { 'Content-Type': 'text/xml' }
  })
}

export async function POST(request: NextRequest) {
  // Read the raw body ONCE — Meta's signature is an HMAC over the raw bytes,
  // so it must be captured before any parsing.
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return new NextResponse('Bad Request', { status: 400 })
  }

  const isMeta =
    !!request.headers.get('x-hub-signature-256') ||
    (request.headers.get('content-type') || '').includes('application/json')

  if (isMeta) {
    return handleMetaWebhook(request, rawBody)
  }
  return handleTwilioWebhook(request, rawBody)
}

// ============================================
// TWILIO BRANCH
// ============================================

async function handleTwilioWebhook(request: NextRequest, rawBody: string) {
  try {
    // ============================================
    // SECURITY: Validate Twilio Signature
    // ============================================
    const signature = request.headers.get('x-twilio-signature')
    const url = request.url

    if (!signature) {
      console.error('❌ Missing Twilio signature header')
      return twimlResponse(403)
    }

    const params: Record<string, string> = {}
    new URLSearchParams(rawBody).forEach((value, key) => {
      params[key] = value
    })

    const authToken = process.env.TWILIO_AUTH_TOKEN
    if (!authToken) {
      console.error('❌ TWILIO_AUTH_TOKEN not configured')
      return twimlResponse(500)
    }

    const isValid = twilio.validateRequest(authToken, signature, url, params)

    if (!isValid) {
      console.error('❌ Invalid Twilio signature - possible unauthorized webhook')
      return twimlResponse(403)
    }

    const from = params['From'] // e.g., "whatsapp:+201234567890"
    const to = params['To'] // Your WhatsApp number

    await processInboundWhatsAppMessage({
      phoneNumber: from.replace('whatsapp:', ''),
      toNumber: to.replace('whatsapp:', ''),
      body: params['Body'],
      messageSid: params['MessageSid'],
      // Twilio hosts this one itself; we never copied it into our bucket.
      mediaUrl: params['MediaUrl0'] || null,
      mediaStoragePath: null,
      mediaType: params['MediaContentType0'] || null
    })

    // Respond to Twilio with 200 OK
    return twimlResponse(200)
  } catch (error: any) {
    console.error('❌ Error processing WhatsApp webhook (twilio):', error)
    // Still return 200 to Twilio to avoid retries
    return twimlResponse(200)
  }
}

// ============================================
// META CLOUD API BRANCH
// ============================================

async function handleMetaWebhook(request: NextRequest, rawBody: string) {
  try {
    // ============================================
    // SECURITY: Validate X-Hub-Signature-256
    // ============================================
    const appSecret = process.env.META_WHATSAPP_APP_SECRET
    if (!appSecret) {
      console.error('❌ META_WHATSAPP_APP_SECRET not configured')
      return NextResponse.json({ error: 'Not configured' }, { status: 500 })
    }

    const signature = request.headers.get('x-hub-signature-256')
    if (!verifyMetaSignature(rawBody, signature, appSecret)) {
      console.error('❌ Invalid Meta signature - possible unauthorized webhook')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let payload: any
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { messages, statuses } = parseMetaWebhook(payload)

    // Delivery receipts arrive on this same URL (no separate status-callback
    // route like Twilio) — apply them to whatsapp_messages by wamid.
    if (statuses.length > 0) {
      await applyMetaStatuses(statuses)
    }

    for (const msg of messages) {
      // Media arrives as an ID whose download URL expires in ~5 minutes —
      // persist the bytes to our own storage before processing.
      let mediaStoragePath: string | null = null
      if (msg.mediaId) {
        mediaStoragePath = await persistInboundMedia(msg.mediaId, msg.messageSid, msg.mediaType)
      }

      await processInboundWhatsAppMessage({
        phoneNumber: msg.from,
        toNumber: msg.to,
        body: msg.body,
        messageSid: msg.messageSid,
        // The bytes are ours now, in a private bucket — there is no external
        // URL to keep, and Meta's own download link expires in ~5 minutes.
        mediaUrl: null,
        mediaStoragePath,
        mediaType: msg.mediaType || null
      })
    }

    // Meta expects a plain 200; non-200 triggers retries.
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('❌ Error processing WhatsApp webhook (meta):', error)
    // Still return 200 to Meta to avoid retries
    return NextResponse.json({ success: true })
  }
}

/** Meta status values map 1:1 onto whatsapp_messages.status
 *  ('sent' | 'delivered' | 'read' | 'failed'); anything else is skipped. */
const META_DB_STATUSES = new Set(['sent', 'delivered', 'read', 'failed'])

async function applyMetaStatuses(statuses: MetaStatusUpdate[]) {
  const admin = getServiceClient()
  if (!admin) return

  for (const s of statuses) {
    if (!META_DB_STATUSES.has(s.status)) continue
    const { error } = await (admin as any)
      .from('whatsapp_messages')
      .update({
        status: s.status,
        error_code: s.errorCode ?? null,
        error_message: s.errorMessage ?? null,
        updated_at: new Date().toISOString()
      })
      .eq('message_sid', s.messageSid)
    if (error) {
      console.error('❌ Error applying Meta status update:', error)
    }
    if (s.status === 'failed') {
      console.error('❌ Message delivery failed:', {
        messageSid: s.messageSid,
        errorCode: s.errorCode,
        errorMessage: s.errorMessage,
        recipient: s.recipient
      })
    }
  }
}

// ============================================
// INBOUND MEDIA PERSISTENCE (Meta only)
// ============================================

const MEDIA_BUCKET = 'whatsapp-media'

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'video/mp4': 'mp4'
}

let _serviceClient: ReturnType<typeof createServiceClient> | null = null

function getServiceClient() {
  if (_serviceClient) return _serviceClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ Service-role Supabase client unavailable (missing env)')
    return null
  }
  _serviceClient = createServiceClient(url, key)
  return _serviceClient
}

async function persistInboundMedia(
  mediaId: string,
  messageSid: string,
  mimeType?: string
): Promise<string | null> {
  // Returns the STORAGE PATH in the private bucket, not a URL.
  try {
    const media = await fetchMetaMedia(mediaId)
    if (!media) return null

    const admin = getServiceClient()
    if (!admin) return null

    const ext = EXTENSION_BY_MIME[media.contentType] || EXTENSION_BY_MIME[mimeType || ''] || 'bin'
    const safeSid = messageSid.replace(/[^a-zA-Z0-9_-]/g, '_')
    const filePath = `inbound/${safeSid}.${ext}`

    let upload = await admin.storage
      .from(MEDIA_BUCKET)
      .upload(filePath, media.buffer, { contentType: media.contentType, upsert: true })
    if (upload.error && /bucket.*not.*found/i.test(upload.error.message)) {
      // PRIVATE. This holds whatever a customer sent into a WhatsApp thread —
      // a passport page, a payment receipt. A public bucket would serve every
      // one of them to anyone holding the URL, and the path carries no tenant
      // prefix to scope even a guess. Reads go through
      // GET /api/whatsapp/media/[id], which re-checks permission and signs.
      await admin.storage.createBucket(MEDIA_BUCKET, { public: false })
      upload = await admin.storage
        .from(MEDIA_BUCKET)
        .upload(filePath, media.buffer, { contentType: media.contentType, upsert: true })
    }
    if (upload.error) {
      console.error('❌ Error storing inbound WhatsApp media:', upload.error)
      return null
    }

    // The PATH, not a URL. Callers store it in media_storage_path.
    return filePath
  } catch (error: any) {
    console.error('❌ Error persisting inbound media:', error?.message || error)
    return null
  }
}

// ============================================
// SHARED INBOUND PIPELINE (provider-agnostic)
// ============================================

interface InboundWhatsAppMessage {
  phoneNumber: string
  toNumber: string
  body: string
  messageSid: string
  /** A link hosted by SOMEONE ELSE — Twilio serves its own inbound media.
   *  Never a public URL for an object in our own bucket. */
  mediaUrl: string | null
  /** Path in the PRIVATE whatsapp-media bucket, for media we downloaded
   *  ourselves (Meta hands us an id whose URL expires in ~5 minutes). */
  mediaStoragePath: string | null
  mediaType: string | null
}

async function processInboundWhatsAppMessage({
  phoneNumber,
  body,
  messageSid,
  mediaUrl,
  mediaStoragePath,
  mediaType
}: InboundWhatsAppMessage) {
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
  } else if (clientTenantId) {
    // Create new conversation (requires a tenant — matched via the client)
    const { data: newConversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .insert({
        phone_number: phoneNumber,
        client_id: clientId,
        client_name: clientName,
        tenant_id: clientTenantId,
        status: 'active'
      })
      .select('id, tenant_id')
      .single()

    if (convError) {
      console.error('❌ Error creating conversation:', convError)
    } else {
      conversationId = newConversation.id
      tenantId = newConversation.tenant_id || clientTenantId
    }
  } else {
    console.error('❌ Cannot create conversation: no tenant found for', phoneNumber)
  }

  // ============================================
  // STEP 3: Store the incoming message
  // ============================================
  let msgError: { code: string; message: string } | null = null
  if (conversationId && tenantId) {
    const insertResult = await supabase
      .from('whatsapp_messages')
      .insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        message_sid: messageSid,
        direction: 'inbound',
        message_body: body,
        media_url: mediaUrl,
        media_storage_path: mediaStoragePath,
        media_type: mediaType,
        status: 'delivered',
        sent_at: new Date().toISOString()
      })
    msgError = insertResult.error
  }

  // 23505 = unique violation on message_sid, i.e. the provider re-delivered a
  // webhook it already sent (timeout, 5xx, or its normal retry policy).
  // This is THE duplicate signal, and it must gate the auto-reply below:
  // previously the violation was logged and execution continued, so a retry
  // generated and SENT a second WhatsApp message to the customer.
  const isDuplicateDelivery = msgError?.code === '23505'

  if (msgError && !isDuplicateDelivery) {
    console.error('❌ Error storing message:', msgError)
  } else if (isDuplicateDelivery) {
    console.warn(`⚠️ Duplicate delivery of ${messageSid} — not replying again`)
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
  if (process.env.WHATSAPP_AI_ENABLED === 'true' && body && conversationId && tenantId && !isDuplicateDelivery) {
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

      if (tenantAiEnabled) {
        const aiResponse = await processIncomingMessage(
          supabase,
          conversationId,
          clientId,
          phoneNumber,
          body,
          tenantId
        )

        if (aiResponse.success && aiResponse.shouldRespond && aiResponse.reply) {
          // Send the AI-generated response (via the active provider)
          const sendResult = await sendWhatsAppMessage({
            to: phoneNumber,
            body: aiResponse.reply
          })

          if (sendResult.success) {
            // Store the outbound message
            await supabase.from('whatsapp_messages').insert({
              tenant_id: tenantId,
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
          } else {
            console.error('❌ Failed to send AI response:', sendResult.error)
          }
        }
      }
    } catch (aiError) {
      console.error('❌ AI processing error:', aiError)
      // Don't fail the webhook - just log the error
    }
  }

  // ============================================
  // STEP 5: Draft-only pre-generation (opt-in per tenant)
  // ============================================
  // Respond to the provider first, then run suggest-reply post-response so
  // the webhook doesn't block. Drafts go into communication_drafts with
  // status='pending' — NOT auto-sent. Gated by copilot_pregenerate_enabled.
  if (tenantId && conversationId && body) {
    try {
      const { data: features } = await supabase
        .from('tenant_features')
        .select('copilot_pregenerate_enabled')
        .eq('tenant_id', tenantId)
        .single()

      if (features?.copilot_pregenerate_enabled) {
        after(async () => {
          try {
            await generateDraftReplies({
              supabase: supabase as any,
              tenantId: tenantId!,
              channel: 'whatsapp',
              whatsappConversationId: conversationId!,
              reviewerUserId: null,
              count: 2,
              skipIfPendingExists: true,
            })
          } catch (err: any) {
            console.error('Pre-generation (whatsapp) failed:', err?.message || err)
          }
        })
      }
    } catch (flagErr) {
      console.error('Pregenerate flag check failed:', flagErr)
    }
  }
}

// ============================================
// GET: Meta verification handshake + health check
// ============================================
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  // Meta webhook verification: echo hub.challenge when the verify token
  // matches. This is how the callback URL is confirmed in the app dashboard.
  if (searchParams.get('hub.mode') === 'subscribe') {
    const verifyToken = process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN
    if (verifyToken && searchParams.get('hub.verify_token') === verifyToken) {
      return new NextResponse(searchParams.get('hub.challenge') ?? '', { status: 200 })
    }
    console.error('❌ Meta webhook verification failed: token mismatch or not configured')
    return new NextResponse('Forbidden', { status: 403 })
  }

  const aiEnabled = process.env.WHATSAPP_AI_ENABLED === 'true'
  const aiToolsEnabled = process.env.WHATSAPP_AI_TOOLS_ENABLED === 'true'
  const aiModel = process.env.WHATSAPP_AI_MODEL || 'claude-sonnet-4-20250514'
  const provider = process.env.WHATSAPP_PROVIDER === 'meta' ? 'meta' : 'twilio'

  return NextResponse.json({
    success: true,
    message: 'WhatsApp webhook endpoint is active',
    provider,
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
// Provider switch:
//   WHATSAPP_PROVIDER          - 'meta' for the Cloud API; unset/'twilio' = Twilio
//
// Required for Twilio:
//   TWILIO_ACCOUNT_SID       - Twilio Account SID
//   TWILIO_AUTH_TOKEN        - Twilio Auth Token (for signature validation)
//   TWILIO_API_KEY           - Twilio API Key (for sending messages)
//   TWILIO_API_SECRET        - Twilio API Secret
//   TWILIO_WHATSAPP_FROM     - WhatsApp number (e.g., whatsapp:+14155238886)
//
// Required for Meta Cloud API:
//   META_WHATSAPP_ACCESS_TOKEN         - System-user token
//   META_WHATSAPP_PHONE_NUMBER_ID      - Phone number ID (used in the send URL)
//   META_WHATSAPP_APP_SECRET           - Validates X-Hub-Signature-256
//   META_WHATSAPP_WEBHOOK_VERIFY_TOKEN - GET verification handshake
//   META_WHATSAPP_BUSINESS_ACCOUNT_ID  - WABA ID (templates; optional)
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
// WEBHOOK SETUP
// ============================================
//
// Twilio: Messaging → WhatsApp sandbox settings → "When a message comes in":
//    https://yourdomain.com/api/whatsapp/webhook
//
// Meta: App dashboard → WhatsApp → Configuration → Callback URL:
//    https://yourdomain.com/api/whatsapp/webhook
//    Verify token = META_WHATSAPP_WEBHOOK_VERIFY_TOKEN, subscribe to 'messages'.
//
// ============================================
