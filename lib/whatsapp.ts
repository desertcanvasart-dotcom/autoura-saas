// ============================================
// AUTOURA - WHATSAPP PROVIDER DISPATCHER
// ============================================
// Single entry point for outbound WhatsApp. Routes to either:
//   - Twilio               (lib/twilio-whatsapp.ts)   — the default
//   - Meta Cloud API       (lib/whatsapp-cloud-api.ts) — direct, no BSP
//
// Switch with WHATSAPP_PROVIDER=meta. Anything else (including unset)
// keeps the battle-tested Twilio path, so a bad Meta config can be
// rolled back instantly by unsetting one env var.
// ============================================

import {
  sendWhatsAppMessage as sendViaTwilio,
  formatWhatsAppNumber,
  type WhatsAppMessage
} from './twilio-whatsapp'
import { sendViaMeta, isMetaConfigured } from './whatsapp-cloud-api'
import { formatPhoneForWhatsApp } from './communication-utils'
import { toConversationPhone } from './whatsapp-phone'

export type WhatsAppProvider = 'twilio' | 'meta'

export type { WhatsAppMessage }
export { formatWhatsAppNumber }

export function getWhatsAppProvider(): WhatsAppProvider {
  return process.env.WHATSAPP_PROVIDER === 'meta' ? 'meta' : 'twilio'
}

/**
 * Send a WhatsApp message via the active provider. Both providers return
 * the same shape; messageId is a Twilio SID or a Meta wamid — either way
 * it goes into whatsapp_messages.message_sid and stays unique.
 */
export async function sendWhatsAppMessage(
  message: WhatsAppMessage
): Promise<{ success: boolean; messageId?: string; error?: string; warning?: string }> {
  const ready = { ...message, to: await internationalNumber(message.to, message.tenantId) }
  const result = getWhatsAppProvider() === 'meta' ? await sendViaMeta(ready) : await sendViaTwilio(ready)
  // On record, so a delivery failure reported later reaches the sender
  // (migration 430) instead of being dropped.
  if (result.success && result.messageId) {
    const { recordOutboundWhatsApp } = await import('@/lib/whatsapp-outbound')
    await recordOutboundWhatsApp({ tenantId: message.tenantId, messageSid: result.messageId, to: ready.to, body: message.body })
  }
  return result
}

/**
 * The number in international form, as both providers need it. Clients are
 * stored as the agency typed them — "0100 123 4567", "0044 20 …" — and the
 * providers only stripped non-digits and added "+", so every server send to a
 * local number went to "+0100…" and was rejected. "00" is the international
 * prefix; a leading 0 is a trunk prefix and takes the sending tenant's country
 * code (lib/communication-utils, the rule the wa.me links already use).
 */
export async function internationalNumber(to: string, tenantId?: string | null): Promise<string> {
  const raw = String(to ?? '').trim()
  const compact = raw.replace(/[\s\-().]/g, '')
  if (compact.startsWith('+')) return compact
  if (compact.startsWith('00')) return '+' + compact.slice(2)
  if (!compact.startsWith('0') || !tenantId) return raw
  const country = await tenantCountry(tenantId)
  const digits = formatPhoneForWhatsApp(compact, country)
  return digits.startsWith('0') ? raw : '+' + digits
}

/**
 * The number as whatsapp_conversations stores it: E.164 with a leading "+",
 * the key the inbound webhook looks conversations up by. Stored without the
 * "+", the customer's reply opened a second conversation (documents audit,
 * round 12). A local "0…" number takes the tenant's country first.
 */
export async function conversationPhoneNumber(to: string, tenantId?: string | null): Promise<string> {
  return toConversationPhone(await internationalNumber(to, tenantId))
}

// Only a country that is set is kept, and for a minute: a send that failed
// for want of one must work once the agency sets it in Settings.
const COUNTRY_CACHE_MS = 60_000
const countryCache = new Map<string, { country: string; at: number }>()
async function tenantCountry(tenantId: string): Promise<string | null> {
  const hit = countryCache.get(tenantId)
  if (hit && Date.now() - hit.at < COUNTRY_CACHE_MS) return hit.country
  try {
    const { createAdminClient } = await import('@/lib/supabase-server')
    const { data } = await createAdminClient().from('tenants').select('operating_country').eq('id', tenantId).maybeSingle()
    const country = (data as { operating_country?: string | null } | null)?.operating_country || null
    if (country) countryCache.set(tenantId, { country, at: Date.now() })
    return country
  } catch {
    return null
  }
}

export async function testWhatsAppConnection(
  testPhone: string
): Promise<{ success: boolean; message: string }> {
  const provider = getWhatsAppProvider()
  const result = await sendWhatsAppMessage({
    to: testPhone,
    body: `✅ Success! Your WhatsApp integration (${provider}) is working correctly. This is a test message from Autoura.`,
    tenantId: null
  })
  return {
    success: result.success,
    message: result.success
      ? 'Test message sent successfully! Check your WhatsApp.'
      : result.error || 'Failed to send test message'
  }
}

/** Config probe used by status/settings endpoints. */
export function whatsAppProviderStatus(): {
  provider: WhatsAppProvider
  configured: boolean
} {
  const provider = getWhatsAppProvider()
  if (provider === 'meta') {
    return { provider, configured: isMetaConfigured() }
  }
  const hasCredentials = !!(
    process.env.TWILIO_ACCOUNT_SID &&
    (process.env.TWILIO_AUTH_TOKEN || (process.env.TWILIO_API_KEY && process.env.TWILIO_API_SECRET))
  )
  const hasNumber = !!(process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_WHATSAPP_NUMBER)
  return { provider, configured: hasCredentials && hasNumber }
}
