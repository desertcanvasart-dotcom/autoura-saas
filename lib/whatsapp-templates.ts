// ============================================
// WhatsApp follow-up templates (operator, 2026-11-19)
// ============================================
// WhatsApp lets a business type a free message only within 24 hours of the
// customer's last message. After that, Twilio refuses it with error 63016 and
// only an approved TEMPLATE goes through. Travel2Egypt's 13 failed sends in
// 30 days were all 63016, and the app had no template to send.
//
// Each company keeps its own approved follow-up templates, one per language,
// in tenants.settings.whatsapp_templates.follow_up (the white-label rule:
// nothing a company sends may be another company's):
//
//   { "en": { "contentSid": "HX…", "body": "Hello from Travel2Egypt. …" },
//     "es": { … }, "ja": { … } }
//
// The template itself is created and approved in Twilio (Content Template
// Builder, WhatsApp approval); the company stores its ID here. `body` is the
// approved text, copied from Twilio when the ID is saved, so the inbox can
// show what was sent.
//
// Pure, apart from the Twilio lookup at the bottom.

export const FOLLOW_UP_LANGUAGES = ['en', 'es', 'ja'] as const
export type FollowUpLanguage = (typeof FOLLOW_UP_LANGUAGES)[number]

export const FOLLOW_UP_LANGUAGE_NAMES: Record<FollowUpLanguage, string> = {
  en: 'English',
  es: 'Spanish',
  ja: 'Japanese',
}

export interface FollowUpTemplate {
  contentSid: string
  body: string
}

export type FollowUpTemplates = Partial<Record<FollowUpLanguage, FollowUpTemplate>>

/** WhatsApp's customer-service window. */
export const WINDOW_HOURS = 24

export function isFollowUpLanguage(v: unknown): v is FollowUpLanguage {
  return typeof v === 'string' && (FOLLOW_UP_LANGUAGES as readonly string[]).includes(v)
}

/** A Twilio Content template ID: "HX" and 32 hex characters. */
export function isContentSid(v: unknown): v is string {
  return typeof v === 'string' && /^HX[0-9a-f]{32}$/i.test(v.trim())
}

/** The company's follow-up templates, from tenants.settings; anything malformed is left out. */
export function readFollowUpTemplates(settings: unknown): FollowUpTemplates {
  const raw = (settings as { whatsapp_templates?: { follow_up?: unknown } } | null)?.whatsapp_templates?.follow_up
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: FollowUpTemplates = {}
  for (const lang of FOLLOW_UP_LANGUAGES) {
    const t = (raw as Record<string, unknown>)[lang] as { contentSid?: unknown; body?: unknown } | undefined
    if (t && isContentSid(t.contentSid) && typeof t.body === 'string' && t.body.trim()) {
      out[lang] = { contentSid: t.contentSid.trim(), body: t.body }
    }
  }
  return out
}

/** tenants.settings with the follow-up templates replaced, every other setting kept. */
export function withFollowUpTemplates(settings: unknown, templates: FollowUpTemplates): Record<string, unknown> {
  const base = settings && typeof settings === 'object' && !Array.isArray(settings) ? (settings as Record<string, unknown>) : {}
  const wt = base.whatsapp_templates && typeof base.whatsapp_templates === 'object' && !Array.isArray(base.whatsapp_templates)
    ? (base.whatsapp_templates as Record<string, unknown>)
    : {}
  return { ...base, whatsapp_templates: { ...wt, follow_up: templates } }
}

export interface WindowState {
  /** A free message can go now. */
  open: boolean
  /** When the customer last wrote; null = never on this conversation. */
  lastInboundAt: string | null
  /** When the window closes (open) or closed (shut); null when never opened. */
  closesAt: string | null
}

/** Whether WhatsApp still allows a free message, from the customer's last message. */
export function windowState(lastInboundAt: string | null | undefined, now: Date = new Date()): WindowState {
  if (!lastInboundAt) return { open: false, lastInboundAt: null, closesAt: null }
  const last = new Date(lastInboundAt)
  if (Number.isNaN(last.getTime())) return { open: false, lastInboundAt: null, closesAt: null }
  const closes = new Date(last.getTime() + WINDOW_HOURS * 3600_000)
  return { open: now < closes, lastInboundAt: last.toISOString(), closesAt: closes.toISOString() }
}

/**
 * The template's variables ({{1}}, {{2}} …) as Twilio's ContentVariables.
 * The drafted follow-ups have none; a company's own template may use {{1}}
 * for the client's first name. Returns null when a variable has no value —
 * WhatsApp refuses an empty one, so the send is refused with a reason instead.
 */
export function templateVariables(body: string, values: { clientFirstName?: string | null }): Record<string, string> | null {
  const used = [...new Set([...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(m => m[1]))]
  const out: Record<string, string> = {}
  for (const n of used) {
    if (n === '1' && values.clientFirstName?.trim()) out['1'] = values.clientFirstName.trim()
    else return null
  }
  return out
}

/** The template text with its variables filled, as stored in the conversation. */
export function fillTemplate(body: string, variables: Record<string, string>): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (all, n: string) => variables[n] ?? all)
}

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
