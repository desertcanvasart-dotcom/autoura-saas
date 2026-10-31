// ============================================
// A visitor enquires: the form, and the WhatsApp button (step 8)
// ============================================
// Both work without JavaScript or cookies. The site is the one the hostname
// serves (never what the form says), the landing page is the Referer when it
// is this site's own page (it carries any utm_* / campaign parameters), and
// the answer is a redirect back to that page. The form's outcome is shown by
// an anchor (#enquiry-sent…) that CSS reveals with :target, so the page
// itself stays cached and static.

import type { SiteResolution, WaRefResult } from '@/lib/publish/contract'
import { clientIpFromHeaders } from '@/lib/client-ip'
import { normalizeHost } from '@/lib/publish/host'
import { t } from '../i18n/strings'

export type EnquiryOutcome = 'sent' | 'slow_down' | 'invalid' | 'failed'

/** The anchor each outcome reveals on the page. */
export const OUTCOME_ANCHOR: Record<EnquiryOutcome, string> = {
  sent: 'enquiry-sent',
  slow_down: 'enquiry-slow',
  invalid: 'enquiry-invalid',
  failed: 'enquiry-failed',
}

/** The page the visitor was on, if it is on this hostname; else null. */
export function landingFrom(referer: string | null, host: string): URL | null {
  if (!referer) return null
  try {
    const url = new URL(referer)
    return normalizeHost(url.host) === host ? url : null
  } catch {
    return null
  }
}

/** An embedded form's landing page: the agency's page the block sits on
 *  (the frame's referrer), only when it is on one of the listed websites. */
export function embedLanding(raw: FormDataEntryValue | null, origins: string[]): URL | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const url = new URL(raw)
    return origins.includes(url.origin.toLowerCase()) ? url : null
  } catch {
    return null
  }
}

/** Where to send the visitor back to: their page, else the site's front door. */
export function backTo(landing: URL | null, language: string, anchor?: string): string {
  const path = landing ? `${landing.pathname}${landing.search}` : `/${language}`
  return anchor ? `${path}#${anchor}` : path
}

const field = (form: FormData, name: string): string => {
  const v = form.get(name)
  return typeof v === 'string' ? v.trim() : ''
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The form as the app's enquiry input; 'spam' when the hidden field was filled
 *  (a bot — answered as if sent, so it learns nothing). */
export function readEnquiryForm(form: FormData, ctx: {
  site: SiteResolution['site']
  landing: URL | null
  visitorIp: string | null
}) {
  if (field(form, 'website') !== '') return 'spam' as const
  const lang = field(form, 'lang')
  const language = ctx.site.languages.includes(lang) ? lang : ctx.site.languages[0]
  const pageId = field(form, 'page')
  const travellers = Number.parseInt(field(form, 'travellers'), 10)
  const travelDate = field(form, 'travel_date')
  // The Contact page's fuller form; absent fields read as not given.
  const count = (name: string, min: number, max: number) => {
    const n = Number.parseInt(field(form, name), 10)
    return Number.isFinite(n) && n >= min && n <= max ? n : null
  }
  const adults = count('adults', 1, 99)
  const children = count('children', 0, 99)
  const interests = [...new Set(form.getAll('interests').filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(Boolean))].slice(0, 12).map(v => v.slice(0, 80))
  return {
    siteId: ctx.site.id,
    pageId: UUID.test(pageId) ? pageId : null,
    language,
    name: field(form, 'name'),
    email: field(form, 'email'),
    phone: field(form, 'phone') || null,
    travellers: Number.isFinite(travellers) && travellers > 0 && travellers < 100 ? travellers
      : adults !== null ? Math.min(99, adults + (children ?? 0)) : null,
    travelDate: /^\d{4}-\d{2}(-\d{2})?$/.test(travelDate) ? travelDate : null,
    message: field(form, 'message') || null,
    whatsapp: field(form, 'whatsapp').slice(0, 40) || null,
    country: field(form, 'country').slice(0, 80) || null,
    nights: count('nights', 1, 90),
    adults,
    children,
    interests,
    consent: field(form, 'consent') === 'yes',
    landingUrl: ctx.landing?.toString() ?? null,
    visitorIp: ctx.visitorIp,
  }
}

/** The visitor's address, for the app's rate limits: the hop the platform's
 *  edge appended to X-Forwarded-For — never the first entry, which the
 *  visitor can write themselves (lib/client-ip.ts, as the app reads it). */
export function visitorIpOf(headers: Headers): string | null {
  return clientIpFromHeaders(headers)
}

/** wa.me with the message pre-written: the tour, and the reference that
 *  links the conversation back to this page — or no reference, when the app
 *  made none (a visitor or site over its click limit). */
export function whatsAppLink(ref: WaRefResult, language: string): string | null {
  if (!ref.number) return null
  const intro = ref.tourName ? `${t(language, 'waInterestedIn')} ${ref.tourName}.` : t(language, 'waHello')
  const text = ref.token ? `${intro}\n\nRef: ${ref.token}` : intro
  return `https://wa.me/${ref.number.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
}
