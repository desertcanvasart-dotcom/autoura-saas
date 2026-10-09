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
  if (getWhatsAppProvider() === 'meta') {
    return sendViaMeta(ready)
  }
  return sendViaTwilio(ready)
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

const countryCache = new Map<string, string | null>()
async function tenantCountry(tenantId: string): Promise<string | null> {
  if (countryCache.has(tenantId)) return countryCache.get(tenantId) ?? null
  try {
    const { createAdminClient } = await import('@/lib/supabase-server')
    const { data } = await createAdminClient().from('tenants').select('operating_country').eq('id', tenantId).maybeSingle()
    const country = (data as { operating_country?: string | null } | null)?.operating_country ?? null
    countryCache.set(tenantId, country)
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
    body: `✅ Success! Your WhatsApp integration (${provider}) is working correctly. This is a test message from Autoura.`
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
