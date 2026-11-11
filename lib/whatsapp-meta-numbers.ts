// ============================================================================
// Which Meta phone-number ID sends for which company
// ============================================================================
// The Cloud API sends from a "phone number ID", not the number itself, and the
// app used ONE (META_WHATSAPP_PHONE_NUMBER_ID) for everybody — so on Meta,
// Travel2Egypt's clients would have heard from GetAutoura's number.
//
// A company's own number is already on record (tenants.whatsapp_number,
// migration 408, set by the Autoura team). Meta knows each number's ID, so the
// ID is ASKED FOR, not stored a second time: GET /{waba}/phone_numbers lists
// every number in the WhatsApp account(s) with its ID and status. Nothing new
// to type in Super Admin, and the two can never disagree.
//
//   META_WHATSAPP_BUSINESS_ACCOUNT_ID  the WhatsApp account ID(s) holding the
//                                      numbers — comma-separated when a
//                                      company's number sits in its own
//                                      account (shared with us as a partner)
//   META_WHATSAPP_PHONE_NUMBER_ID      the number a company WITHOUT its own
//                                      sends from (the shared one)

import { toWhatsAppE164 } from './whatsapp-tenant'

export interface MetaPhoneNumber {
  /** The phone number ID the Cloud API sends from. */
  id: string
  /** E.164, "+2015…". */
  number: string
  /** The approved display name, when Meta returns one. */
  name: string | null
  /** CONNECTED when it can send and receive (Meta's `status`). */
  status: string
  wabaId: string
}

type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

const GRAPH_BASE = 'https://graph.facebook.com'
const graphVersion = () => process.env.META_GRAPH_API_VERSION || 'v21.0'

/** The WhatsApp account IDs to look numbers up in. */
export function metaBusinessAccountIds(): string[] {
  return String(process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID ?? '')
    .split(/[,\s]+/)
    .map(s => s.trim())
    .filter(s => /^\d+$/.test(s))
}

// Five minutes: a number moved or re-registered is picked up soon, without a
// Graph call on every send.
const CACHE_MS = 5 * 60_000
let cache: { at: number; numbers: MetaPhoneNumber[] } | null = null

/** For tests. */
export function clearMetaNumberCache(): void {
  cache = null
}

/** Every number in the configured WhatsApp account(s). Throws when Meta cannot be asked. */
export async function listMetaPhoneNumbers(fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<MetaPhoneNumber[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.numbers
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN
  const wabas = metaBusinessAccountIds()
  if (!token || wabas.length === 0) return []

  const numbers: MetaPhoneNumber[] = []
  for (const waba of wabas) {
    const url = `${GRAPH_BASE}/${graphVersion()}/${waba}/phone_numbers?fields=id,display_phone_number,verified_name,status&limit=100`
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) })
    const json = (await res.json().catch(() => null)) as { data?: Array<Record<string, unknown>>; error?: { message?: string } } | null
    if (!res.ok) throw new Error(json?.error?.message || `Meta phone number list failed (HTTP ${res.status})`)
    for (const row of json?.data ?? []) {
      const number = toWhatsAppE164(row.display_phone_number)
      if (!row.id || !number) continue
      numbers.push({
        id: String(row.id),
        number,
        name: row.verified_name ? String(row.verified_name) : null,
        status: String(row.status ?? '').toUpperCase(),
        wabaId: waba,
      })
    }
  }
  cache = { at: Date.now(), numbers }
  return numbers
}

/**
 * The phone number ID to send from for this company's own number, or null
 * when the company has none or Meta does not list it (the caller then uses
 * the shared META_WHATSAPP_PHONE_NUMBER_ID). A failed lookup is null, never
 * a reason not to send.
 */
export async function metaPhoneNumberIdFor(
  ownNumber: string | null | undefined,
  fetchImpl?: FetchLike,
): Promise<string | null> {
  const number = toWhatsAppE164(ownNumber)
  if (!number) return null
  try {
    const found = (await listMetaPhoneNumbers(fetchImpl)).find(n => n.number === number)
    return found?.id ?? null
  } catch (error) {
    console.error('Meta phone number lookup failed — using the shared number:', (error as Error).message)
    return null
  }
}

/**
 * The same check Super Admin runs against Twilio, against Meta: the number is
 * in our WhatsApp account(s), and connected.
 */
export async function checkMetaSender(
  number: string,
  fetchImpl?: FetchLike,
): Promise<{ ok: true; status: string } | { ok: false; reason: 'not_found' | 'not_online' | 'unavailable'; error: string }> {
  if (metaBusinessAccountIds().length === 0 || !process.env.META_WHATSAPP_ACCESS_TOKEN) {
    return { ok: false, reason: 'unavailable', error: 'Meta is not set up: META_WHATSAPP_ACCESS_TOKEN and META_WHATSAPP_BUSINESS_ACCOUNT_ID are needed to check the number.' }
  }
  let numbers: MetaPhoneNumber[]
  try {
    numbers = await listMetaPhoneNumbers(fetchImpl)
  } catch (error) {
    return { ok: false, reason: 'unavailable', error: `Could not check the number with Meta: ${(error as Error).message}` }
  }
  const found = numbers.find(n => n.number === number)
  if (!found) {
    return { ok: false, reason: 'not_found', error: `${number} is not in your Meta WhatsApp account. Move or add the number in WhatsApp Manager first.` }
  }
  if (found.status !== 'CONNECTED') {
    return { ok: false, reason: 'not_online', error: `${number} is in your Meta WhatsApp account but not connected yet (status: ${found.status || 'unknown'}).` }
  }
  return { ok: true, status: found.status }
}
