import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadPage } from '../../../../../../../lib/internal-api'
import type { Mode } from '../../../../../../../lib/routing'
import { THEMES } from '../../../../../../../themes'
import { alternateLinks, jsonLdScript, structuredData } from '../../../../../../../lib/seo'
import { EnquiryForm } from '../../../../../../../themes/blocks/EnquiryForm'
import { EmbedRuntime } from '../../../../../../../themes/blocks/EmbedRuntime'

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

/** The enquiry form on its own, as a block on the agency's website. */
const EMBED_ENQUIRE = 'enquire'

async function pageFor(params: Promise<Params>) {
  const p = await params
  if (p.mode !== 'live' && p.mode !== 'preview' && p.mode !== 'embed') return null
  const path = (p.path ?? []).join('/')
  const enquireOnly = p.mode === 'embed' && path === EMBED_ENQUIRE
  const page = await loadPage({
    tenantId: p.tenant, siteId: p.site, mode: p.mode as Mode, language: p.lang,
    path: enquireOnly ? '' : path,
  })
  return page ? { page, preview: p.mode === 'preview', embed: p.mode === 'embed', enquireOnly } : null
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const found = await pageFor(params)
  if (!found) return { robots: { index: false } }
  const { page, preview, embed } = found
  // A block lives on the agency's page; it is never indexed on its own.
  if (embed) return { title: page.title, robots: { index: false, follow: false } }
  // An approved SEO title/description (still true to the facts) wins.
  const seo = page.tour?.narrative?.seo ?? null
  const title = seo?.title ?? (page.kind === 'home' ? page.site.companyName : `${page.title} · ${page.site.companyName}`)
  // The address search engines are given: the site's primary hostname, with
  // every language version and x-default (step 9). None before it has one.
  const links = alternateLinks(page)
  return {
    title,
    description: seo?.description,
    // A test hostname, or a page not yet published, is never indexed.
    robots: preview || page.unpublished ? { index: false, follow: false } : undefined,
    ...(links ? {
      metadataBase: new URL(links.canonical),
      alternates: { canonical: links.canonical, languages: links.languages },
      openGraph: {
        type: 'website', url: links.canonical, title, description: seo?.description,
        siteName: page.site.companyName, locale: page.language,
        images: page.tour?.facts?.images.slice(0, 1),
      },
    } : {}),
  }
}

export default async function SitePage({ params }: { params: Promise<Params> }) {
  const found = await pageFor(params)
  if (!found) notFound()
  const theme = THEMES[found.page.site.archetype]
  if (found.embed) {
    // No header or footer — the agency's own page is the frame.
    return (
      <div data-embed="">
        <EmbedRuntime />
        {found.enquireOnly
          ? <EnquiryForm page={found.page} variant="compact" />
          : <theme.Page page={found.page} preview={false} />}
      </div>
    )
  }
  return (
    <theme.Frame page={found.page} preview={found.preview}>
      {structuredData(found.page).map((block, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(block) }} />
      ))}
      <theme.Page page={found.page} preview={found.preview} />
    </theme.Frame>
  )
}
