import { normalizeHost } from '@/lib/publish/site-data'
import { requestWaRef, siteForHost } from '../../../lib/internal-api'
import { backTo, landingFrom, whatsAppLink } from '../../../lib/lead-capture'

// ============================================
// The WhatsApp button (GET /api/wa?page=…&lang=…)
// ============================================
// Records which page (and campaign) the visitor came from under a short
// reference, then opens WhatsApp with the company's own number and a message
// that carries it. A company without its own number shows no button; if one
// is followed anyway, the visitor goes back to the page.

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const host = normalizeHost(request.headers.get('host'))
  const resolution = host ? await siteForHost(host).catch(() => null) : null
  if (!host || !resolution) return new Response('Not found', { status: 404 })

  const url = new URL(request.url)
  const page = url.searchParams.get('page') ?? ''
  const lang = url.searchParams.get('lang') ?? ''
  const language = resolution.site.languages.includes(lang) ? lang : resolution.site.languages[0]
  const landing = landingFrom(request.headers.get('referer'), host)

  let target: string | null = null
  try {
    const ref = await requestWaRef({
      siteId: resolution.site.id,
      pageId: UUID.test(page) ? page : null,
      language,
      landingUrl: landing?.toString() ?? null,
    })
    target = whatsAppLink(ref, language)
  } catch (e) {
    console.error('[sites] WhatsApp reference failed:', e instanceof Error ? e.message : e)
  }
  return new Response(null, {
    status: 302,
    headers: { location: target ?? backTo(landing, language), 'cache-control': 'no-store' },
  })
}
