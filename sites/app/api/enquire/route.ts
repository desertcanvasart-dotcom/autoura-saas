import { normalizeHost } from '@/lib/publish/site-data'
import { sendEnquiry, siteForEmbedKey, siteForHost } from '../../../lib/internal-api'
import { OUTCOME_ANCHOR, backTo, embedLanding, landingFrom, readEnquiryForm, visitorIpOf, type EnquiryOutcome } from '../../../lib/lead-capture'

// ============================================
// The enquiry form was sent (POST, plain HTML form — no JavaScript needed)
// ============================================
// Forwards it to the GetAutoura app (lead + enquiry + note + bell) and sends
// the visitor back to their page, at the anchor that says how it went. On
// the agency's own website (a block) the site comes from the embed key, and
// the landing page is the agency's page — counted only if it is one of the
// websites the agency listed.

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const host = normalizeHost(request.headers.get('host'))
  const form = await request.formData().catch(() => new FormData())
  const embedKey = form.get('embed_key')

  let site, landing: URL | null = null
  if (typeof embedKey === 'string' && embedKey) {
    const found = await siteForEmbedKey(embedKey).catch(() => null)
    if (!found) return new Response('Not found', { status: 404 })
    site = found.site
    landing = embedLanding(form.get('landing'), found.origins)
  } else {
    const resolution = host ? await siteForHost(host).catch(() => null) : null
    if (!host || !resolution) return new Response('Not found', { status: 404 })
    site = resolution.site
    landing = landingFrom(request.headers.get('referer'), host)
  }

  const input = readEnquiryForm(form, { site, landing, visitorIp: visitorIpOf(request.headers) })
  const language = input === 'spam' ? site.languages[0] : input.language

  let outcome: EnquiryOutcome = 'sent'
  if (input !== 'spam') {
    try {
      outcome = await sendEnquiry(input)
    } catch (e) {
      console.error('[sites] enquiry failed:', e instanceof Error ? e.message : e)
      outcome = 'failed'
    }
  }
  // Back to the page the form was on: the block itself when embedded (its
  // address is on this host), else the visitor's page on this site.
  const back = host ? landingFrom(request.headers.get('referer'), host) : null
  return new Response(null, { status: 303, headers: { location: backTo(back ?? landing, language, OUTCOME_ANCHOR[outcome]) } })
}
