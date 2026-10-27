import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadPage } from '../../../../../../../lib/internal-api'
import type { Mode } from '../../../../../../../lib/routing'
import { THEMES } from '../../../../../../../themes'

// ============================================
// One page of a company's site, drawn by its archetype's theme
// ============================================
// Static, built on first request and kept until the sync worker revalidates
// its company's tags (PLAN D9); the hour is a backstop. Tour facts arrive in
// step 5; until then the theme renders only the sections that need none.

export const revalidate = 3600
export const dynamicParams = true
export async function generateStaticParams() {
  return []
}

type Params = { tenant: string; site: string; mode: string; lang: string; path?: string[] }

async function pageFor(params: Promise<Params>) {
  const p = await params
  if (p.mode !== 'live' && p.mode !== 'preview') return null
  const page = await loadPage({
    tenantId: p.tenant, siteId: p.site, mode: p.mode as Mode, language: p.lang,
    path: (p.path ?? []).join('/'),
  })
  return page ? { page, preview: p.mode === 'preview' } : null
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const found = await pageFor(params)
  if (!found) return { robots: { index: false } }
  const { page, preview } = found
  return {
    title: page.kind === 'home' ? page.site.companyName : `${page.title} · ${page.site.companyName}`,
    // A test hostname, or a page not yet published, is never indexed.
    robots: preview || page.unpublished ? { index: false, follow: false } : undefined,
  }
}

export default async function SitePage({ params }: { params: Promise<Params> }) {
  const found = await pageFor(params)
  if (!found) notFound()
  const theme = THEMES[found.page.site.archetype]
  return (
    <theme.Frame page={found.page} preview={found.preview}>
      <theme.Page page={found.page} preview={found.preview} />
    </theme.Frame>
  )
}
