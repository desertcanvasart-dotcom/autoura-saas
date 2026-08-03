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
  if (getWhatsAppProvider() === 'meta') {
    return sendViaMeta(message)
  }
  return sendViaTwilio(message)
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
