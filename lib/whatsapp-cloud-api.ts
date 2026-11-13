// ============================================
// AUTOURA - META WHATSAPP CLOUD API SERVICE
// ============================================
// Direct integration with Meta's WhatsApp Business Cloud API
// (graph.facebook.com) — no Twilio in the path.
//
// Selected via WHATSAPP_PROVIDER=meta (see lib/whatsapp.ts dispatcher).
// While WHATSAPP_PROVIDER is unset or 'twilio', none of this code runs
// in production — the Twilio path in lib/twilio-whatsapp.ts stays live.
//
// Env vars:
//   META_WHATSAPP_ACCESS_TOKEN         - System-user token (whatsapp_business_messaging)
//   META_WHATSAPP_PHONE_NUMBER_ID      - Phone number ID a company WITHOUT its own number sends from
//                                        (a company's own number: lib/whatsapp-meta-numbers.ts)
//   META_WHATSAPP_APP_SECRET           - App secret, validates X-Hub-Signature-256
//   META_WHATSAPP_WEBHOOK_VERIFY_TOKEN - Shared secret for the GET verification handshake
//   META_WHATSAPP_BUSINESS_ACCOUNT_ID  - WABA ID(s), comma-separated: where each company's own
//                                        number's phone number ID is looked up
//   META_GRAPH_API_VERSION             - Graph API version (default v21.0)
// ============================================

import { kindOfLink } from '@/lib/whatsapp/attachments'
import crypto from 'crypto'
import type { WhatsAppMessage } from './twilio-whatsapp'
import { metaBusinessAccountIds, metaPhoneNumberIdFor } from './whatsapp-meta-numbers'

const GRAPH_BASE = 'https://graph.facebook.com'

function graphVersion(): string {
  return process.env.META_GRAPH_API_VERSION || 'v21.0'
}

function accessToken(): string | undefined {
  return process.env.META_WHATSAPP_ACCESS_TOKEN
}

function phoneNumberId(): string | undefined {
  return process.env.META_WHATSAPP_PHONE_NUMBER_ID
}

export function isMetaConfigured(): boolean {
  return !!(accessToken() && (phoneNumberId() || metaBusinessAccountIds().length > 0))
}

/** Meta's limit on a media caption; a longer body goes as its own text. */
export const META_CAPTION_LIMIT = 1024

/** The company's own number, as Super Admin set it (migration 408), or null. */
async function ownNumberOf(tenantId: string | null | undefined): Promise<string | null> {
  if (!tenantId) return null
  try {
    const { createAdminClient } = await import('@/lib/supabase-server')
    const { data } = await createAdminClient().from('tenants').select('whatsapp_number').eq('id', tenantId).maybeSingle()
    return (data as { whatsapp_number?: string | null } | null)?.whatsapp_number ?? null
  } catch {
    return null
  }
}

/**
 * The phone number ID this company sends from: its own number's, looked up
 * in Meta (lib/whatsapp-meta-numbers.ts), else the shared one.
 */
export async function senderPhoneNumberId(tenantId: string | null | undefined): Promise<string | undefined> {
  const own = await metaPhoneNumberIdFor(await ownNumberOf(tenantId))
  return own ?? phoneNumberId()
}

// ============================================
// HELPERS
// ============================================

/**
 * Format a phone number for the Cloud API: bare digits, no '+' and no
 * 'whatsapp:' prefix (unlike Twilio). Accepts the same loose inputs
 * formatWhatsAppNumber does.
 */
export function formatMetaNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length < 10) {
    throw new Error('Invalid phone number: too short')
  }
  return cleaned
}

// Which kind of message a link is sent as, from its extension (our stored
// paths always end in it): lib/whatsapp/attachments.ts, one rule.
function mediaPayload(mediaUrl: string, caption: string) {
  const kind = kindOfLink(mediaUrl)
  // Voice notes and other sound files go as audio (Ogg/Opus plays as a voice
  // note). Audio messages take no caption.
  if (kind === 'audio') return { type: 'audio' as const, audio: { link: mediaUrl } }
  if (kind === 'image') return { type: 'image' as const, image: { link: mediaUrl, ...(caption && { caption }) } }
  if (kind === 'video') return { type: 'video' as const, video: { link: mediaUrl, ...(caption && { caption }) } }
  // Everything else goes as a document, named after the link's last segment —
  // the attach button stores files under their own name for exactly this.
  const filename = decodeURIComponent(mediaUrl.split('/').pop()?.split('?')[0] || 'document.pdf')
  return { type: 'document' as const, document: { link: mediaUrl, filename, ...(caption && { caption }) } }
}

/** Meta error codes that mean "outside the 24-hour customer service window". */
const REENGAGEMENT_ERROR_CODES = new Set([131047, 131026])

// ============================================
// OUTBOUND SENDING
// ============================================

/**
 * Send a WhatsApp message via the Cloud API. Signature-compatible with the
 * Twilio sendWhatsAppMessage so the dispatcher can swap providers freely.
 */
export async function sendViaMeta({
  to,
  body,
  mediaUrl,
  tenantId
}: WhatsAppMessage): Promise<{ success: boolean; messageId?: string; error?: string; warning?: string }> {
  // A caption past Meta's limit is refused: the file goes bare and the words
  // follow as their own message.
  if (mediaUrl && body && body.length > META_CAPTION_LIMIT) {
    const media = await sendViaMeta({ to, body: '', mediaUrl, tenantId })
    if (!media.success) return media
    const text = await sendViaMeta({ to, body, tenantId })
    return text.success ? media : { ...text, warning: 'The file was sent; its message was not.' }
  }
  try {
    const token = accessToken()
    const numberId = await senderPhoneNumberId(tenantId)
    if (!token || !numberId) {
      throw new Error('Meta WhatsApp not configured: set META_WHATSAPP_ACCESS_TOKEN, and META_WHATSAPP_PHONE_NUMBER_ID or the company’s own number in META_WHATSAPP_BUSINESS_ACCOUNT_ID')
    }

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formatMetaNumber(to),
      ...(mediaUrl ? mediaPayload(mediaUrl, body) : { type: 'text', text: { body } })
    }

    const response = await fetch(`${GRAPH_BASE}/${graphVersion()}/${numberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    })

    const json = await response.json().catch(() => null)

    if (!response.ok) {
      const metaError = json?.error
      console.error('❌ Meta Cloud API send failed:', metaError || response.statusText)

      if (metaError?.code && REENGAGEMENT_ERROR_CODES.has(metaError.code)) {
        return {
          success: false,
          error: 'Customer must message first (24-hour window). Use a template message to initiate.'
        }
      }

      return {
        success: false,
        error: metaError?.message || `Cloud API request failed (HTTP ${response.status})`
      }
    }

    const messageId = json?.messages?.[0]?.id
    if (!messageId) {
      return { success: false, error: 'Cloud API returned no message id' }
    }

    return { success: true, messageId }
  } catch (error: any) {
    console.error('❌ Failed to send WhatsApp message via Meta:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// WEBHOOK: SIGNATURE VERIFICATION
// ============================================

/**
 * Verify Meta's X-Hub-Signature-256 header: HMAC-SHA256 of the RAW request
 * body keyed with the app secret. The raw body must be read before any
 * JSON parsing or the digest won't match.
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false

  const expected = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  const received = signatureHeader.slice('sha256='.length)

  const expectedBuf = Buffer.from(expected, 'utf8')
  const receivedBuf = Buffer.from(received, 'utf8')
  if (expectedBuf.length !== receivedBuf.length) return false

  return crypto.timingSafeEqual(expectedBuf, receivedBuf)
}

// ============================================
// WEBHOOK: PAYLOAD PARSING
// ============================================

export interface MetaInboundMessage {
  /** wamid — stored in whatsapp_messages.message_sid, stable across retries */
  messageSid: string
  /** Sender phone, bare digits (no '+', no 'whatsapp:') */
  from: string
  /** Our business number (display number, bare digits) */
  to: string
  /** Text body, or the media caption for media messages */
  body: string
  /** Present for image/document/audio/video/sticker messages */
  mediaId?: string
  mediaType?: string
  /** A document's own file name, as the customer's WhatsApp sent it. */
  mediaFilename?: string
  profileName?: string
  timestamp?: string
}

export interface MetaStatusUpdate {
  messageSid: string
  /** sent | delivered | read | failed (Meta also emits 'deleted') */
  status: string
  errorCode?: string
  errorMessage?: string
  recipient?: string
}

const MEDIA_MESSAGE_TYPES = ['image', 'document', 'audio', 'video', 'sticker'] as const

/**
 * Flatten a Cloud API webhook payload (entry[].changes[].value) into
 * normalized inbound messages and delivery-status updates. Unlike Twilio,
 * Meta delivers BOTH on the same webhook URL.
 */
export function parseMetaWebhook(payload: any): {
  messages: MetaInboundMessage[]
  statuses: MetaStatusUpdate[]
} {
  const messages: MetaInboundMessage[] = []
  const statuses: MetaStatusUpdate[] = []

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== 'messages') continue
      const value = change?.value
      if (!value) continue

      const businessNumber = (value.metadata?.display_phone_number || '').replace(/\D/g, '')
      const profileName = value.contacts?.[0]?.profile?.name

      for (const msg of value.messages ?? []) {
        if (!msg?.id || !msg?.from) continue

        let body = ''
        let mediaId: string | undefined
        let mediaType: string | undefined
        let mediaFilename: string | undefined

        if (msg.type === 'text') {
          body = msg.text?.body ?? ''
        } else if (MEDIA_MESSAGE_TYPES.includes(msg.type)) {
          const media = msg[msg.type]
          body = media?.caption ?? ''
          mediaId = media?.id
          mediaType = media?.mime_type
          mediaFilename = typeof media?.filename === 'string' && media.filename.trim() ? media.filename.trim().slice(0, 200) : undefined
        } else if (msg.type === 'button') {
          body = msg.button?.text ?? ''
        } else if (msg.type === 'interactive') {
          body =
            msg.interactive?.button_reply?.title ??
            msg.interactive?.list_reply?.title ??
            ''
        }
        // location/contacts/unsupported types fall through with empty body —
        // still recorded so the conversation timeline stays complete.

        messages.push({
          messageSid: msg.id,
          from: String(msg.from).replace(/\D/g, ''),
          to: businessNumber,
          body,
          mediaId,
          mediaType,
          mediaFilename,
          profileName,
          timestamp: msg.timestamp
        })
      }

      for (const status of value.statuses ?? []) {
        if (!status?.id) continue
        const firstError = status.errors?.[0]
        statuses.push({
          messageSid: status.id,
          status: status.status,
          errorCode: firstError?.code != null ? String(firstError.code) : undefined,
          errorMessage: firstError?.message || firstError?.title,
          recipient: status.recipient_id ? String(status.recipient_id).replace(/\D/g, '') : undefined
        })
      }
    }
  }

  return { messages, statuses }
}

// ============================================
// INBOUND MEDIA
// ============================================

/**
 * Download inbound media. Meta hands the webhook a media ID; resolving it
 * returns a URL that expires in ~5 minutes, so callers must download
 * immediately and persist the bytes to their own storage.
 */
export async function fetchMetaMedia(
  mediaId: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const token = accessToken()
  if (!token) {
    console.error('❌ Cannot fetch Meta media: META_WHATSAPP_ACCESS_TOKEN not set')
    return null
  }

  try {
    const metaRes = await fetch(`${GRAPH_BASE}/${graphVersion()}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!metaRes.ok) {
      console.error(`❌ Meta media lookup failed (HTTP ${metaRes.status}) for ${mediaId}`)
      return null
    }
    const meta = await metaRes.json()
    if (!meta?.url) return null

    const fileRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(60_000),
    })
    if (!fileRes.ok) {
      console.error(`❌ Meta media download failed (HTTP ${fileRes.status}) for ${mediaId}`)
      return null
    }

    const buffer = Buffer.from(await fileRes.arrayBuffer())
    const contentType = meta.mime_type || fileRes.headers.get('content-type') || 'application/octet-stream'
    return { buffer, contentType }
  } catch (error: any) {
    console.error('❌ Error fetching Meta media:', error?.message || error)
    return null
  }
}
