import { normalizeHost } from '@/lib/publish/site-data'
import { sendEnquiry, siteForHost } from '../../../lib/internal-api'
import { OUTCOME_ANCHOR, backTo, landingFrom, readEnquiryForm, visitorIpOf, type EnquiryOutcome } from '../../../lib/lead-capture'

// ============================================
// The enquiry form was sent (POST, plain HTML form — no JavaScript needed)
// ============================================
// Forwards it to the GetAutoura app (lead + enquiry + note + bell) and sends
// the visitor back to their page, at the anchor that says how it went.

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const host = normalizeHost(request.headers.get('host'))
  const resolution = host ? await siteForHost(host).catch(() => null) : null
  if (!host || !resolution) return new Response('Not found', { status: 404 })

  const landing = landingFrom(request.headers.get('referer'), host)
  const form = await request.formData().catch(() => new FormData())
  const input = readEnquiryForm(form, { site: resolution.site, landing, visitorIp: visitorIpOf(request.headers) })
  const language = input === 'spam' ? resolution.site.languages[0] : input.language

  let outcome: EnquiryOutcome = 'sent'
  if (input !== 'spam') {
    try {
      outcome = await sendEnquiry(input)
    } catch (e) {
      console.error('[sites] enquiry failed:', e instanceof Error ? e.message : e)
      outcome = 'failed'
    }
  }
  return new Response(null, { status: 303, headers: { location: backTo(landing, language, OUTCOME_ANCHOR[outcome]) } })
}
