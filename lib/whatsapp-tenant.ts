// ============================================================================
// Which company a WhatsApp number belongs to
// ============================================================================
// Every number is a sender in the platform's one Twilio account. A company may
// have its own (tenants.whatsapp_number, migration 408, set by the Autoura
// team); a company without one sends from the shared number
// (TWILIO_WHATSAPP_FROM / TWILIO_WHATSAPP_NUMBER).
//
// Inbound: a message to a company's own number is that company's — a first-
// time sender included. A message to any other number (the shared one) is
// routed as before: by an existing conversation, else a known client
// (app/api/whatsapp/webhook).
//
// Outbound: a company's own number when it has one, else the shared number —
// nobody is cut off (unlike travel-ops-pro, where the first company with a
// number stopped every company without one from sending).

import { toConversationPhone } from './whatsapp-phone'

const E164 = /^\+[1-9]\d{7,14}$/

/** The number as E.164 ("+2010…"), or null when it is not one. */
export function toWhatsAppE164(raw: unknown): string | null {
  const text = String(raw ?? '').trim().replace(/^whatsapp:/i, '')
  const number = toConversationPhone(text)
  return E164.test(number) ? number : null
}

/** The platform's shared WhatsApp number, E.164, or null when none is set. */
export function sharedWhatsAppNumber(): string | null {
  return toWhatsAppE164(process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_WHATSAPP_NUMBER)
}

// The service client's shape, as far as these lookups need it.
interface TenantsReader {
  from(table: 'tenants'): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }>
      }
    }
  }
}

/**
 * The company that owns the number a message was sent TO, or null when no
 * company does (the shared number). A failed lookup throws — the webhook asks
 * the provider to deliver again rather than file the message under nobody.
 */
export async function tenantForWhatsAppNumber(db: TenantsReader, toNumber: unknown): Promise<string | null> {
  const number = toWhatsAppE164(toNumber)
  if (!number) return null
  const { data, error } = await db.from('tenants').select('id').eq('whatsapp_number', number).maybeSingle()
  if (error) throw new Error(`WhatsApp number lookup: ${error.message}`)
  return (data as { id?: string } | null)?.id ?? null
}

/**
 * The "from" for a company's send: its own number, else the shared one, as
 * Twilio wants it ("whatsapp:+…"); null when neither is set. A failed lookup
 * falls back to the shared number rather than not sending.
 */
export async function whatsAppSenderFor(db: TenantsReader | null, tenantId: string | null): Promise<string | null> {
  if (tenantId && db) {
    try {
      const { data } = await db.from('tenants').select('whatsapp_number').eq('id', tenantId).maybeSingle()
      const own = toWhatsAppE164((data as { whatsapp_number?: string | null } | null)?.whatsapp_number)
      if (own) return `whatsapp:${own}`
    } catch (error) {
      console.error('WhatsApp sender lookup failed — using the shared number:', (error as Error).message)
    }
  }
  const shared = sharedWhatsAppNumber()
  return shared ? `whatsapp:${shared}` : null
}

/**
 * A number the Autoura team may give a company: E.164, or blank to go back
 * to the shared number. Never the shared number itself — every company
 * without its own already sends from it, and the one that "owned" it would
 * receive everyone's replies.
 */
export function checkTenantWhatsAppNumber(raw: unknown):
  | { ok: true; number: string | null }
  | { ok: false; status: number; error: string } {
  if (raw === null || raw === undefined || String(raw).trim() === '') return { ok: true, number: null }
  const number = toWhatsAppE164(raw)
  if (!number) {
    return { ok: false, status: 400, error: 'Enter the number in international form, with its country code (e.g. +81 3 1234 5678).' }
  }
  if (number === sharedWhatsAppNumber()) {
    return { ok: false, status: 409, error: 'That is the shared platform number — every company without its own number already uses it.' }
  }
  return { ok: true, number }
}
