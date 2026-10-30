// ============================================
// Publish — enquiries from a company's website (step 8, PLAN §11)
// ============================================
// Two doors in Phase 1 (operator, 2026-10-27):
//   * the enquiry form   → a lead (clients), a publish_enquiries row, a client
//                          note with the message, and a bell notice. No Inbox
//                          conversation (Q3).
//   * click-to-WhatsApp  → only for a company with its own number (Q7). The
//                          click stores a reference; the message the visitor
//                          sends carries it ("Ref: …"), and the WhatsApp
//                          webhook turns that into a publish_enquiries row.
// The concierge bot is not on company sites in Phase 1 (Q1: it lives inside
// travel2egypt-next and speaks as Travel2Egypt).
//
// The site always comes from the hostname the renderer resolved; nothing the
// visitor sends can point an enquiry at another company.

import { randomInt } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EnquiryInput, WaRefInput, WaRefResult } from './contract'
import { findOrCreateLead } from '@/lib/clients/find-or-create-lead'
import { splitName } from '@/lib/concierge-brief-schema'
import { toWhatsAppE164 } from '@/lib/whatsapp-tenant'

export class EnquiryRejected extends Error {}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const

/** The utm_* parameters and the campaign of the page a visitor came in on. */
export function attributionOf(landingUrl: string | null): { utm: Record<string, string>; campaign: string | null } {
  if (!landingUrl) return { utm: {}, campaign: null }
  let url: URL
  try { url = new URL(landingUrl) } catch { return { utm: {}, campaign: null } }
  const utm: Record<string, string> = {}
  for (const key of UTM_KEYS) {
    const value = url.searchParams.get(key)?.trim()
    if (value) utm[key.slice(4)] = value.slice(0, 200)
  }
  const campaign = (url.searchParams.get('campaign')?.trim() || utm.campaign || '').slice(0, 200) || null
  return { utm, campaign }
}

const LANGUAGE_LABELS: Record<string, string> = { en: 'English', fr: 'French', es: 'Spanish', de: 'German', it: 'Italian' }

type SiteRow = { id: string; tenant_id: string; status: string }

async function siteOf(db: SupabaseClient, siteId: string): Promise<SiteRow> {
  const { data, error } = await db.from('publish_sites').select('id, tenant_id, status').eq('id', siteId).maybeSingle()
  if (error) throw new Error(`reading the site: ${error.message}`)
  if (!data || data.status === 'suspended') throw new EnquiryRejected('no such site')
  return data as SiteRow
}

/** The page, if it is one of this site's; a stale or foreign id is dropped, not trusted. */
async function pageOf(db: SupabaseClient, site: SiteRow, pageId: string | null): Promise<{ id: string; tourTemplateId: string | null; tourName: string | null } | null> {
  if (!pageId) return null
  const { data, error } = await db.from('publish_pages').select('id, tour_template_id, tour_templates(template_name)')
    .eq('id', pageId).eq('site_id', site.id).eq('tenant_id', site.tenant_id).maybeSingle()
  if (error) throw new Error(`reading the page: ${error.message}`)
  if (!data) return null
  const tour = (data as { tour_templates?: { template_name?: string } | null }).tour_templates
  return { id: data.id, tourTemplateId: data.tour_template_id ?? null, tourName: tour?.template_name ?? null }
}

type Notify = (input: { tenant_id: string; dedupe_key: string; type: string; title: string; message: string; link?: string | null }) => Promise<void>

/** The enquiry form: the lead, the enquiry, the note, the bell. */
export async function recordWebEnquiry(db: SupabaseClient, input: EnquiryInput, deps: { notify: Notify }): Promise<{ enquiryId: string; clientId: string }> {
  const site = await siteOf(db, input.siteId)
  const page = await pageOf(db, site, input.pageId)

  const clientId = await findOrCreateLead(db, site.tenant_id, { email: input.email, phone: input.phone }, {
    ...splitName(input.name),
    email: input.email,
    phone: input.phone,
    nationality: 'Unknown',
    status: 'lead',
    client_type: 'individual',
    passport_type: 'other',
    preferred_language: LANGUAGE_LABELS[input.language] ?? 'English',
    client_source: 'website',
    vip_status: false,
    ...(input.whatsapp ? { whatsapp: input.whatsapp } : {}),
    ...(input.country ? { country: input.country } : {}),
    ...(input.interests?.length ? { special_interests: input.interests } : {}),
  }, '[publish enquiry]')
  if (!clientId) throw new Error('the lead could not be saved')
  await fillLeadGaps(db, site.tenant_id, clientId, input)

  const { utm, campaign } = attributionOf(input.landingUrl)
  const { data: enquiry, error } = await db.from('publish_enquiries').insert({
    tenant_id: site.tenant_id,
    site_id: site.id,
    page_id: page?.id ?? null,
    client_id: clientId,
    source: 'web_form',
    landing_url: input.landingUrl,
    campaign,
    utm,
    language: input.language,
    tour_template_id: page?.tourTemplateId ?? null,
    dates: input.travelDate ? { from: input.travelDate } : null,
    travellers: input.travellers,
    message: input.message,
    whatsapp: input.whatsapp ?? null,
    country: input.country ?? null,
    nights: input.nights ?? null,
    adults: input.adults ?? null,
    children: input.children ?? null,
    interests: input.interests ?? [],
    consent_at: input.consent ? new Date().toISOString() : null,
  }).select('id').single()
  if (error) throw new Error(`saving the enquiry: ${error.message}`)

  const about = page?.tourName ? `about ${page.tourName}` : 'from the website'
  const details = [
    input.travelDate && `travel ${input.travelDate}`,
    input.nights && `${input.nights} night${input.nights === 1 ? '' : 's'}`,
    input.adults
      ? `${input.adults} adult${input.adults === 1 ? '' : 's'}${input.children ? `, ${input.children} child${input.children === 1 ? '' : 'ren'}` : ''}`
      : input.travellers && `${input.travellers} traveller${input.travellers === 1 ? '' : 's'}`,
    input.phone && `phone ${input.phone}`,
    input.whatsapp && `WhatsApp ${input.whatsapp}`,
    input.country && `from ${input.country}`,
    input.interests?.length && `interested in ${input.interests.join(', ')}`,
  ].filter(Boolean).join(', ')
  try {
    await db.from('client_notes').insert({
      client_id: clientId,
      tenant_id: site.tenant_id,
      note_text: `[Website enquiry ${about}]${details ? ` ${details}.` : ''}${input.message ? `\n${input.message}` : ''}`,
      note_type: 'general',
      is_internal: true,
    })
  } catch (e) {
    console.warn('[publish enquiry] could not save the client note (non-blocking):', e)
  }
  try {
    await deps.notify({
      tenant_id: site.tenant_id,
      dedupe_key: `publish-enquiry:${enquiry.id}`,
      type: 'publish_enquiry',
      title: `Website enquiry from ${input.name}`,
      message: page?.tourName ?? (input.message ?? '').slice(0, 120),
      link: `/clients/${clientId}`,
    })
  } catch (e) {
    console.error('[publish enquiry] bell notification failed:', (e as Error).message)
  }
  return { enquiryId: enquiry.id, clientId }
}

/** A lead that already existed keeps what it had; the enquiry only fills
 *  what was empty (its WhatsApp, its country) and adds new interests. */
async function fillLeadGaps(db: SupabaseClient, tenantId: string, clientId: string, input: EnquiryInput): Promise<void> {
  if (!input.whatsapp && !input.country && !input.interests?.length) return
  try {
    const { data } = await db.from('clients').select('whatsapp, country, special_interests').eq('id', clientId).eq('tenant_id', tenantId).maybeSingle()
    if (!data) return
    const had = (data.special_interests as string[] | null) ?? []
    const patch: Record<string, unknown> = {}
    if (input.whatsapp && !data.whatsapp) patch.whatsapp = input.whatsapp
    if (input.country && !data.country) patch.country = input.country
    const added = (input.interests ?? []).filter(x => !had.includes(x))
    if (added.length) patch.special_interests = [...had, ...added]
    if (Object.keys(patch).length) await db.from('clients').update(patch).eq('id', clientId).eq('tenant_id', tenantId)
  } catch (e) {
    console.warn('[publish enquiry] could not fill the lead\'s details (non-blocking):', e)
  }
}

// ---------- click-to-WhatsApp ----------

// No 0/O or 1/I: a reference a visitor might retype must survive it.
const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function newRefToken(length = 8): string {
  let token = ''
  for (let i = 0; i < length; i++) token += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)]
  return token
}

/** The reference a WhatsApp message carries back. "Ref" stays in English in
 *  every language, so one pattern matches. */
export const REF_PATTERN = /\bRef[:\s]+([A-Za-z0-9]{6,16})\b/i

export function refTokenIn(body: string | null | undefined): string | null {
  const match = body ? REF_PATTERN.exec(body) : null
  return match ? match[1].toUpperCase() : null
}

/** A visitor clicked the WhatsApp button: the company's own number and a
 *  fresh reference — or nothing, when the company has no number of its own. */
export async function createWaRef(db: SupabaseClient, input: WaRefInput): Promise<WaRefResult> {
  const site = await siteOf(db, input.siteId)
  const { data: tenant, error } = await db.from('tenants').select('whatsapp_number').eq('id', site.tenant_id).maybeSingle()
  if (error) throw new Error(`reading the company: ${error.message}`)
  const number = toWhatsAppE164((tenant as { whatsapp_number?: string | null } | null)?.whatsapp_number)
  if (!number) return { number: null, token: null, tourName: null }

  const page = await pageOf(db, site, input.pageId)
  const { campaign } = attributionOf(input.landingUrl)
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = newRefToken()
    const { error: insErr } = await db.from('publish_wa_refs').insert({
      token, tenant_id: site.tenant_id, site_id: site.id, page_id: page?.id ?? null,
      landing_url: input.landingUrl, campaign, language: input.language,
    })
    if (!insErr) return { number, token, tourName: page?.tourName ?? null }
    if (insErr.code !== '23505') throw new Error(`saving the reference: ${insErr.message}`)
  }
  throw new Error('could not make a unique reference')
}

/** An inbound WhatsApp message to a company: if it carries one of that
 *  company's unused references, record the enquiry it came from. Returns the
 *  enquiry id, or null when there is nothing to record. */
export async function matchWaRef(db: SupabaseClient, input: {
  tenantId: string
  body: string | null | undefined
  conversationId: string
  clientId: string | null
}): Promise<string | null> {
  const token = refTokenIn(input.body)
  if (!token) return null
  // Claim it: only the first message carrying a reference counts.
  const { data: ref, error } = await db.from('publish_wa_refs')
    .update({ matched_at: new Date().toISOString() })
    .eq('token', token).eq('tenant_id', input.tenantId).is('matched_at', null)
    .select('site_id, page_id, landing_url, campaign, language')
    .maybeSingle()
  if (error) throw new Error(`claiming the reference: ${error.message}`)
  if (!ref) return null

  let tourTemplateId: string | null = null
  if (ref.page_id) {
    const { data: page } = await db.from('publish_pages').select('tour_template_id').eq('id', ref.page_id).eq('tenant_id', input.tenantId).maybeSingle()
    tourTemplateId = (page as { tour_template_id?: string | null } | null)?.tour_template_id ?? null
  }
  const { data: enquiry, error: insErr } = await db.from('publish_enquiries').insert({
    tenant_id: input.tenantId,
    site_id: ref.site_id,
    page_id: ref.page_id,
    client_id: input.clientId,
    source: 'whatsapp',
    landing_url: ref.landing_url,
    campaign: ref.campaign,
    utm: attributionOf(ref.landing_url).utm,
    language: ref.language,
    tour_template_id: tourTemplateId,
    whatsapp_conversation_id: input.conversationId,
    ref_token: token,
  }).select('id').single()
  if (insErr) throw new Error(`saving the WhatsApp enquiry: ${insErr.message}`)
  return enquiry.id
}
