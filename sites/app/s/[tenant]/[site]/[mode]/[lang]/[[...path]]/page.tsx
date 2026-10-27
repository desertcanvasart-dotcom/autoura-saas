import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadPage } from '../../../../../../../lib/internal-api'
import type { Mode } from '../../../../../../../lib/routing'

// ============================================
// One page of a company's site
// ============================================
// Static, built on first request and kept until the sync worker revalidates
// its company's tags (PLAN D9); the hour is a backstop. Step 3 renders the
// page's structure only — the tour facts arrive in step 5, the themes in 4.

export const revalidate = 3600
export const dynamicParams = true
export async function generateStaticParams() {
  return []
}

type Params = { tenant: string; site: string; mode: string; lang: string; path?: string[] }

async function pageFor(params: Promise<Params>) {
  const p = await params
  if (p.mode !== 'live' && p.mode !== 'preview') return null
  return loadPage({
    tenantId: p.tenant, siteId: p.site, mode: p.mode as Mode, language: p.lang,
    path: (p.path ?? []).join('/'),
  })
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params
  const page = await pageFor(params)
  if (!page) return { robots: { index: false } }
  return {
    title: page.kind === 'home' ? page.site.companyName : `${page.title} · ${page.site.companyName}`,
    // A test hostname, or a page not yet published, is never indexed.
    robots: p.mode === 'preview' || page.unpublished ? { index: false, follow: false } : undefined,
  }
}

export default async function SitePage({ params }: { params: Promise<Params> }) {
  const page = await pageFor(params)
  if (!page) notFound()
  const lang = page.language
  return (
    <article data-kind={page.kind}>
      {page.unpublished && <p className="unpublished">Not yet published</p>}
      <h1>{page.kind === 'listing' ? 'Tours' : page.title}</h1>
      {page.tours.length > 0 && (
        <ul className="tour-list">
          {page.tours.map(t => <li key={t.path}><a href={`/${lang}/${t.path}`}>{t.title}</a></li>)}
        </ul>
      )}
    </article>
  )
}
