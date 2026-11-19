// The Twilio side of the follow-up templates (lib/whatsapp-templates.ts):
// server only, kept out of the screens' bundle.

export interface TwilioTemplateInfo {
  contentSid: string
  name: string
  language: string
  body: string
  /** WhatsApp's verdict: approved, pending, rejected, unsubmitted … */
  approval: string
  rejectionReason: string | null
}

/**
 * Reads a template from the platform's Twilio account: its text and whether
 * WhatsApp approved it. Throws when the ID is unknown.
 */
export async function fetchTwilioTemplate(contentSid: string): Promise<TwilioTemplateInfo> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const apiKey = process.env.TWILIO_API_KEY
  const apiSecret = process.env.TWILIO_API_SECRET
  if (!accountSid || !apiKey || !apiSecret) throw new Error('Twilio is not configured')
  const twilio = (await import('twilio')).default
  const client = twilio(apiKey, apiSecret, { accountSid })
  const content = await client.content.v1.contents(contentSid).fetch()
  const approval = await client.content.v1.contents(contentSid).approvalFetch().fetch().catch(() => null)
  const types = (content.types ?? {}) as Record<string, { body?: string }>
  const body = types['twilio/text']?.body ?? Object.values(types).find(t => typeof t?.body === 'string')?.body ?? ''
  const wa = (approval?.whatsapp ?? {}) as { status?: string; rejection_reason?: string }
  return {
    contentSid,
    name: content.friendlyName,
    language: content.language,
    body,
    approval: String(wa.status ?? 'unsubmitted').toLowerCase(),
    rejectionReason: wa.rejection_reason || null,
  }
}
