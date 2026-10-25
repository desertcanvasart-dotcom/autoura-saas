import { notFound } from 'next/navigation'
import { loadPage } from '../../../../../../lib/internal-api'
import type { Mode } from '../../../../../../lib/routing'
import '../../../../../globals.css'

// ============================================
// A company's site, in one language — the root of every page
// ============================================
// The root layout, so <html lang> is right for each language version
// (separate URLs per language; never a script toggle). Step 4 replaces this
// plain frame with the archetype themes and the company's brand layer.

export const dynamicParams = true
export async function generateStaticParams() {
  return [] // built on first request, then served static until a tag changes
}

type Params = { tenant: string; site: string; mode: string; lang: string }

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<Params> }) {
  const p = await params
  if (p.mode !== 'live' && p.mode !== 'preview') notFound()
  const home = await loadPage({ tenantId: p.tenant, siteId: p.site, mode: p.mode as Mode, language: p.lang, path: '' })
  if (!home) notFound()
  return (
    <html lang={p.lang}>
      <body>
        {p.mode === 'preview' && <div className="preview-banner">Preview — this site is not public</div>}
        <header className="site-header">
          <a href={`/${p.lang}`} className="site-name">{home.site.companyName}</a>
          <nav>
            <a href={`/${p.lang}/tours`}>Tours</a>
            {home.site.languages.filter(l => l !== p.lang).map(l => (
              <a key={l} href={`/${l}`} hrefLang={l} lang={l}>{l.toUpperCase()}</a>
            ))}
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-footer">© {home.site.companyName}</footer>
      </body>
    </html>
  )
}
