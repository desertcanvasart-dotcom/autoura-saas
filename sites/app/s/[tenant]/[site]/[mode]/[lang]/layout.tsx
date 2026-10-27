import { notFound } from 'next/navigation'
import { loadPage } from '../../../../../../lib/internal-api'
import type { Mode } from '../../../../../../lib/routing'
import { fontPair } from '../../../../../../themes/fonts'
import { brandCssVariables, resolveBrand } from '@/lib/publish/brand'
import '../../../../../globals.css'

// ============================================
// A company's site, in one language — the root of every page
// ============================================
// The root layout, so <html lang> is right for each language version
// (separate URLs per language; never a script toggle). It applies the brand
// layer — the company's typeface pair and palette as CSS variables — and
// nothing else: the archetype theme draws each page (../[[...path]]).

export const dynamicParams = true
export async function generateStaticParams() {
  return [] // built on first request, then served static until a tag changes
}

type Params = { tenant: string; site: string; mode: string; lang: string }

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<Params> }) {
  const p = await params
  if (p.mode !== 'live' && p.mode !== 'preview' && p.mode !== 'embed') notFound()
  const home = await loadPage({ tenantId: p.tenant, siteId: p.site, mode: p.mode as Mode, language: p.lang, path: '' })
  if (!home) notFound()
  const brand = resolveBrand(home.site.archetype, home.site.brand)
  const fonts = fontPair(brand.fontPair)
  return (
    <html lang={p.lang} className={fonts.className}>
      <body data-archetype={home.site.archetype} style={{ ...brandCssVariables(brand), ...fonts.vars } as React.CSSProperties}>
        {children}
      </body>
    </html>
  )
}
