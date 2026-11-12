// ============================================================================
// Numbers a company blocked on WhatsApp (migration 465)
// ============================================================================
// A message from a blocked number is not stored: no conversation, no message,
// no bell, no CRM lead, no AI reply (app/api/whatsapp/webhook). The block row
// keeps only a count and the time of the last ignored message — never what
// was said — so a manager can see the block is working.
//
// Per company: one company's block never touches another's inbox.
//
// Inside Autoura only: the sender's WhatsApp still delivers to the number.
// A WhatsApp-level block exists on Meta's Cloud API alone, not on Twilio.

import { toWhatsAppE164 } from './whatsapp-tenant'

export interface BlockedNumber {
  id: string
  phone_number: string
  reason: string | null
  blocked_by: string | null
  blocked_message_count: number
  last_blocked_at: string | null
  created_at: string
}

/** A number a manager may block: E.164, else refused saying why. */
export function checkBlockNumber(raw: unknown):
  | { ok: true; number: string }
  | { ok: false; error: string } {
  const number = toWhatsAppE164(raw)
  if (!number) {
    return { ok: false, error: 'Enter the number in international form, with its country code (e.g. +20 100 123 4567).' }
  }
  return { ok: true, number }
}

/** The block (if any) for this number in a list the page already holds. */
export function findBlocked<T extends { phone_number: string }>(list: T[], phone: unknown): T | null {
  const number = toWhatsAppE164(phone)
  if (!number) return null
  return list.find(b => b.phone_number === number) ?? null
}

// The service client's shape, as far as the webhook's check needs it.
interface BlockedReader {
  from(table: 'whatsapp_blocked_numbers'): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }>
        }
      }
    }
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }>
    }
  }
}

/**
 * Whether the company blocked this sender. When it did, the ignored message
 * is counted on the block row (best-effort: a failed count still blocks).
 * A failed lookup throws — the webhook asks the provider to deliver again
 * rather than file a message that may be from a blocked number.
 */
export async function inboundIsBlocked(db: BlockedReader, tenantId: string, phone: unknown): Promise<boolean> {
  const number = toWhatsAppE164(phone)
  if (!number) return false
  const { data, error } = await db
    .from('whatsapp_blocked_numbers')
    .select('id, blocked_message_count')
    .eq('tenant_id', tenantId)
    .eq('phone_number', number)
    .maybeSingle()
  if (error) throw new Error(`blocked-number lookup: ${error.message}`)
  const row = data as { id?: string; blocked_message_count?: number | null } | null
  if (!row?.id) return false
  try {
    const { error: countError } = await db
      .from('whatsapp_blocked_numbers')
      .update({ blocked_message_count: (row.blocked_message_count ?? 0) + 1, last_blocked_at: new Date().toISOString() })
      .eq('id', row.id)
    if (countError) console.error('Blocked WhatsApp count not recorded:', countError.message)
  } catch (e) {
    console.error('Blocked WhatsApp count not recorded:', (e as Error).message)
  }
  return true
}
