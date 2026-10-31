import { normalizeHost } from '@/lib/publish/host'
import { resolveBrand } from '@/lib/publish/brand'
import { siteForHost } from '../../lib/internal-api'
import { iconSvg } from '../../lib/icon'

// ============================================
// The site's tab icon: the agency's initial in its own main colour
// ============================================
// Every site gets one without uploading anything (a logo upload can replace
// it later). Colours are validated hex from the brand layer, the letter is
// escaped, so the SVG is safe to serve.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const host = normalizeHost(request.headers.get('host'))
  const found = host ? await siteForHost(host).catch(() => null) : null
  const brand = resolveBrand(found?.site.archetype ?? 'modern', found?.site.brand ?? {})
  return new Response(iconSvg(found?.site.companyName ?? 'Autoura', brand.palette.primary, brand.onPrimary), {
    headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=3600' },
  })
}
