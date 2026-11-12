// ============================================
// Website enquiries from a company's OWN website (migration 464)
// ============================================
// Operator, 2026-11-12: Travel2Egypt's own site (travel2egypt-next, not an
// app-published site) only emailed its enquiry form to info@, which the app
// does not read. The site now sends each enquiry, signed with the concierge
// secret, to /api/webhooks/website-lead. It is filed exactly like an enquiry
// from an app-published site (lib/publish/enquiries.ts): the lead, a
// publish_enquiries row, a client note and a bell notice — once per the
// site's own reference (publish_enquiries.external_ref).
//
// validateExternalEnquiry is pure (the tests call it); recordExternalEnquiry
// takes the service connection, so every lookup names the company itself.

import type { SupabaseClient } from '@supabase/supabase-js'
import { findOrCreateLead } from '@/lib/clients/find-or-create-lead'

export interface ExternalEnquiry {
  brand: string
  reference: string
  /** 'trip' (plan a trip) or 'day_tour' (a date for one day tour). */
  kind: string
  email: string
  whatsapp: string | null
  locale: string | null
  travelMonth: string | null
  startDate: string | null
  endDate: string | null
  days: string | null
  adults: number | null
  children: number | null
  childAges: string | null
  budget: string | null
  tourTitle: string | null
  tourUrl: string | null
  notes: string | null
  pageUrl: string | null
  utm: Record<string, string>
  enquiryType: string | null
  journey: string | null
  styleAnswer: string | null
  departure: string | null
  estimate: string | null
}

export type Validation =
  | { ok: true; enquiry: ExternalEnquiry }
  | { ok: false; field: string; error: string }

const str = (v: unknown, max = 500): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}
const int = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 1000 ? n : null
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** The body the site sends → the enquiry, or the first field that is wrong. */
export function validateExternalEnquiry(body: unknown): Validation {
  if (!body || typeof body !== 'object') return { ok: false, field: 'body', error: 'Expected a JSON object.' }
  const b = body as Record<string, unknown>
  const brand = str(b.brand, 64)
  if (!brand) return { ok: false, field: 'brand', error: 'brand is required.' }
  const reference = str(b.reference, 40)
  if (!reference || !/^[A-Za-z0-9-]{4,40}$/.test(reference)) return { ok: false, field: 'reference', error: 'reference is required (letters, digits, dashes).' }
  const email = str(b.email, 254)?.toLowerCase() ?? null
  if (!email || !EMAIL.test(email)) return { ok: false, field: 'email', error: 'A valid email is required.' }
  const date = (v: unknown) => { const s = str(v, 10); return s && DATE.test(s) ? s : null }
  const utm: Record<string, string> = {}
  if (b.utm && typeof b.utm === 'object') {
    for (const [k, v] of Object.entries(b.utm as Record<string, unknown>).slice(0, 10)) {
      const s = str(v, 200)
      if (s) utm[k.replace(/^utm_/, '').slice(0, 40)] = s
    }
  }
  const style = Array.isArray(b.style_answer)
    ? b.style_answer.map(x => str(x, 100)).filter(Boolean).join(', ') || null
    : str(b.style_answer, 300)
  return {
    ok: true,
    enquiry: {
      brand,
      reference,
      kind: str(b.kind, 20) ?? 'trip',
      email,
      whatsapp: str(b.whatsapp, 40),
      locale: str(b.locale, 10),
      travelMonth: str(b.travel_month, 7),
      startDate: date(b.start_date),
      endDate: date(b.end_date),
      days: str(b.days, 40),
      adults: int(b.adults),
      children: int(b.children),
      childAges: str(b.child_ages, 100),
      budget: str(b.budget, 100),
      tourTitle: str(b.tour_title, 200),
      tourUrl: str(b.tour_url, 500),
      notes: str(b.notes, 4000),
      pageUrl: str(b.page_url, 500),
      utm,
      enquiryType: str(b.enquiry_type, 40),
      journey: str(b.journey, 100),
      styleAnswer: style,
      departure: str(b.departure, 100),
      estimate: str(b.estimate, 60),
    },
  }
}

/** "john.smith_88@x.com" → "John Smith": a name to file a lead under when the
 *  form asks only for an email. */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0].replace(/[0-9]+/g, ' ').replace(/[._+-]+/g, ' ').trim()
  const words = local.split(/\s+/).filter(w => w.length > 1)
  return words.length ? words.map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ') : 'Website Lead'
}

/** The lead's first/last name from its email. One word stays the first name
 *  with an empty last name — never doubled ("Louisebarmore Louisebarmore"). */
export function leadNameFromEmail(email: string): { first_name: string; last_name: string } {
  const words = nameFromEmail(email).split(' ')
  return words.length > 1 ? { first_name: words[0], last_name: words.slice(1).join(' ') } : { first_name: words[0], last_name: '' }
}

const LANGUAGES: Record<string, string> = { en: 'English', es: 'Spanish', ja: 'Japanese', fr: 'French', de: 'German', it: 'Italian' }
const lang2 = (locale: string | null) => (locale ?? '').slice(0, 2).toLowerCase()

/** When they want to travel, as the team reads it. */
export function whenLabel(e: Pick<ExternalEnquiry, 'startDate' | 'endDate' | 'travelMonth'>): string | null {
  if (e.startDate && e.endDate) return `${e.startDate} → ${e.endDate}`
  if (e.startDate) return e.startDate
  if (e.travelMonth && /^\d{4}-\d{2}$/.test(e.travelMonth)) {
    const [y, m] = e.travelMonth.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  }
  return null
}

/** The client note: every answer the visitor gave, one line each. */
export function enquiryNote(e: ExternalEnquiry): string {
  const party = e.adults != null
    ? `${e.adults} adult${e.adults === 1 ? '' : 's'}${e.children ? `, ${e.children} child${e.children === 1 ? '' : 'ren'}${e.childAges ? ` (ages ${e.childAges})` : ''}` : ''}`
    : null
  const lines: Array<[string, string | null]> = [
    ['Request', e.kind === 'day_tour' ? 'Day tour date' : e.enquiryType === 'small_group' ? 'Small group' : 'Trip'],
    ['Tour', e.tourTitle ? `${e.tourTitle}${e.tourUrl ? ` (${e.tourUrl})` : ''}` : null],
    ['When', whenLabel(e)],
    ['Length', e.days],
    ['Travellers', party],
    ['Budget', e.budget],
    ['Departure', e.departure],
    ['Journey', e.journey],
    ['Style', e.styleAnswer],
    ['Estimate shown', e.estimate],
    ['WhatsApp', e.whatsapp],
    ['Page', e.pageUrl],
  ]
  const body = lines.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n')
  return `[Website enquiry ${e.reference}]\n${body}${e.notes ? `\n\n${e.notes}` : ''}`
}

type Notify = (input: { tenant_id: string; dedupe_key: string; type: string; title: string; message: string; link?: string | null }) => Promise<void>

export type RecordResult = { status: 'received' | 'duplicate_ignored'; enquiryId: string; clientId: string | null }

/** File one enquiry for `tenantId` — once per reference. */
export async function recordExternalEnquiry(
  db: SupabaseClient,
  tenantId: string,
  e: ExternalEnquiry,
  deps: { notify: Notify },
): Promise<RecordResult> {
  const { data: seen, error: seenError } = await db.from('publish_enquiries')
    .select('id, client_id').eq('tenant_id', tenantId).eq('external_ref', e.reference).maybeSingle()
  if (seenError) throw new Error(`checking the reference: ${seenError.message}`)
  if (seen) return { status: 'duplicate_ignored', enquiryId: seen.id, clientId: seen.client_id }

  const clientId = await findOrCreateLead(db, tenantId, { email: e.email, phone: e.whatsapp }, {
    ...leadNameFromEmail(e.email),
    email: e.email,
    nationality: 'Unknown',
    status: 'lead',
    client_type: 'individual',
    passport_type: 'other',
    preferred_language: LANGUAGES[lang2(e.locale)] ?? 'English',
    client_source: 'website',
    vip_status: false,
    ...(e.whatsapp ? { whatsapp: e.whatsapp, phone: e.whatsapp } : {}),
  }, '[website lead]')
  if (!clientId) throw new Error('the lead could not be saved')

  const language = /^[a-z]{2}$/.test(lang2(e.locale)) ? lang2(e.locale) : null
  const { data: enquiry, error } = await db.from('publish_enquiries').insert({
    tenant_id: tenantId,
    site_id: null,
    client_id: clientId,
    source: 'web_form',
    external_ref: e.reference,
    landing_url: e.pageUrl,
    campaign: e.utm.campaign ?? null,
    utm: e.utm,
    language,
    dates: e.startDate || e.travelMonth ? { ...(e.startDate ? { from: e.startDate } : {}), ...(e.endDate ? { to: e.endDate } : {}), ...(e.travelMonth ? { month: e.travelMonth } : {}) } : null,
    travellers: (e.adults ?? 0) + (e.children ?? 0) > 0 ? (e.adults ?? 0) + (e.children ?? 0) : null,
    adults: e.adults,
    children: e.children,
    message: e.notes,
    whatsapp: e.whatsapp,
  }).select('id').single()
  if (error) {
    // Two sends at once: the other one filed it.
    if (error.code === '23505') {
      const { data: again } = await db.from('publish_enquiries').select('id, client_id').eq('tenant_id', tenantId).eq('external_ref', e.reference).maybeSingle()
      if (again) return { status: 'duplicate_ignored', enquiryId: again.id, clientId: again.client_id }
    }
    throw new Error(`saving the enquiry: ${error.message}`)
  }

  try {
    await db.from('client_notes').insert({ client_id: clientId, tenant_id: tenantId, note_text: enquiryNote(e), note_type: 'general', is_internal: true })
  } catch (err) {
    console.warn('[website lead] could not save the client note (non-blocking):', err)
  }
  try {
    await deps.notify({
      tenant_id: tenantId,
      dedupe_key: `website-lead:${enquiry.id}`,
      type: 'publish_enquiry',
      title: `Website enquiry from ${e.email}`,
      message: [e.tourTitle, whenLabel(e)].filter(Boolean).join(' · ') || (e.notes ?? '').slice(0, 120),
      link: `/clients/${clientId}`,
    })
  } catch (err) {
    console.error('[website lead] bell notification failed:', (err as Error).message)
  }
  return { status: 'received', enquiryId: enquiry.id, clientId }
}
