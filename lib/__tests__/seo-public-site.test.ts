// The public site as search engines and AI assistants read it: every page's
// metadata, the structured data, robots, sitemap and /llms.txt — and the
// blog's alt text and meta descriptions.
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

vi.mock('@/lib/blog/db', () => ({ blogDb: () => { throw new Error('no database in tests') } }))

import { absoluteUrl, breadcrumbs, buildPageMetadata, plainDescription, siteGraph, ORG_ID, SITE_URL } from '@/lib/seo/site'
import { coverAlt, postDescription, postJsonLd, withImageAlts } from '@/lib/blog/seo'
import { validatePostInput, type BlogPost } from '@/lib/blog/posts'
import { llmsFullTxt, llmsTxt } from '@/lib/seo/llms'
import { CATEGORIES } from '@/app/(public)/docs/toc'
import { docJsonLd, docMetadata } from '@/app/(public)/docs/seo'
import robots, { AI_AND_SEARCH_CRAWLERS, PRIVATE_PATHS } from '@/app/robots'
import sitemap from '@/app/sitemap'
import JsonLd from '@/components/seo/JsonLd'
import { PRICING_FAQ } from '@/lib/marketing/pricing-faq'
import { PRICING_TIERS } from '@/lib/pricing-config'

// eslint-friendly loose shape for reading structured data back
type Json = Record<string, unknown> & { itemListElement: Json[]; offers?: unknown }

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const post = (over: Partial<BlogPost> = {}): BlogPost => ({
  id: 'p1', slug: 'nile-quotes', language: 'en', title: 'Quoting a Nile cruise in ten minutes',
  excerpt: null, seo_description: null, body_html: '<p>Start with the rate sheet.</p>',
  cover_image_url: 'https://cdn.example/cover.jpg', cover_image_alt: null, author_name: 'Sara',
  tags: ['how-to'], status: 'published', published_at: '2026-09-01T08:00:00Z',
  created_at: '2026-08-30T08:00:00Z', updated_at: '2026-09-03T08:00:00Z', ...over,
})

describe('page metadata', () => {
  it('gives every page its own canonical, share url, title and card', () => {
    const m = buildPageMetadata({ title: 'Pricing', description: 'd', path: '/pricing' })
    expect(m.alternates?.canonical).toBe('/pricing')
    expect(m.openGraph).toMatchObject({ url: '/pricing', title: 'Pricing · Autoura', siteName: 'Autoura', locale: 'en_US' })
    expect(m.twitter).toMatchObject({ card: 'summary_large_image' })
    expect(m.robots).toBeUndefined()
    expect(buildPageMetadata({ title: 'x', description: 'd', path: '/x', noindex: true }).robots).toEqual({ index: false, follow: true })
  })

  it('the public section layouts all use it, with a 110–160 character description', () => {
    for (const section of ['about', 'contact', 'demo', 'integrations', 'pricing', 'privacy', 'terms']) {
      const src = read(`app/(public)/${section}/layout.tsx`)
      expect(src, section).toContain('buildPageMetadata(')
      expect(src, section).toContain(`path: '/${section}'`)
      const desc = src.match(/description:\s*\n?\s*[`'](.+?)[`'],/)?.[1] ?? ''
      const length = desc.replace(/\$\{TRIAL_DAYS\}/, '14').length
      expect(length, section).toBeGreaterThanOrEqual(110)
      expect(length, section).toBeLessThanOrEqual(160)
    }
  })

  it('the pricing description does not publish the Agency price', () => {
    expect(read('app/(public)/pricing/layout.tsx')).not.toContain('449')
  })

  it('plainDescription strips tags and cuts at a word', () => {
    expect(plainDescription('<p>Hello&nbsp;<b>world</b></p>')).toBe('Hello world')
    const long = plainDescription('word '.repeat(80))
    expect(long.length).toBeLessThanOrEqual(158)
    expect(long.endsWith('word…')).toBe(true)
  })
})

describe('structured data', () => {
  it('one connected graph: Organization, WebSite and the product', () => {
    const graph = siteGraph()['@graph'] as Array<Record<string, unknown>>
    expect(graph.map(n => n['@type'])).toEqual(['Organization', 'WebSite', 'SoftwareApplication'])
    expect(graph[1].publisher).toEqual({ '@id': ORG_ID })
    expect(graph[2].publisher).toEqual({ '@id': ORG_ID })
  })

  it('the offer covers only publicly priced plans', () => {
    const app = (siteGraph()['@graph'] as Array<Json>)[2]
    const published = Object.values(PRICING_TIERS).filter(t => t.publiclyPriced).map(t => t.monthlyPrice as number)
    expect(app.offers).toMatchObject({ '@type': 'AggregateOffer', priceCurrency: 'USD', lowPrice: Math.min(...published), highPrice: Math.max(...published) })
    expect(JSON.stringify(app)).not.toContain('449')
  })

  it('breadcrumbs start at Home with absolute urls', () => {
    const b = breadcrumbs([{ name: 'Blog', path: '/blog' }])
    expect(b.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
    ])
  })

  it('JsonLd cannot be broken out of by a value containing </script>', () => {
    const el = JsonLd({ data: { name: '</script><script>alert(1)</script>' } }) as { props: { dangerouslySetInnerHTML: { __html: string } } }
    const html = el.props.dangerouslySetInnerHTML.__html
    expect(html).not.toContain('</script>')
    expect(JSON.parse(html).name).toBe('</script><script>alert(1)</script>')
  })

  it('the root layout publishes the site graph', () => {
    expect(read('app/layout.tsx')).toContain('<JsonLd data={siteGraph()} />')
  })

  it('the pricing FAQPage carries the questions the page shows', () => {
    const layout = read('app/(public)/pricing/layout.tsx')
    expect(layout).toContain("'@type': 'FAQPage'")
    expect(layout).toContain('PRICING_FAQ.map(')
    expect(read('app/(public)/pricing/page.tsx')).toContain("PRICING_FAQ as FAQ")
    expect(PRICING_FAQ.length).toBeGreaterThan(3)
    expect(PRICING_FAQ.every(f => f.q.endsWith('?') && f.a.length > 20)).toBe(true)
  })
})

describe('docs pages', () => {
  const docs = CATEGORIES.flatMap(c => c.items).filter(i => i.href.startsWith('/docs/'))

  it('each has its own title and description, from the table of contents', () => {
    const titles = new Set<string>()
    for (const d of docs) {
      const m = docMetadata(d.href)
      expect(m.alternates?.canonical).toBe(d.href)
      titles.add(String(m.title))
      expect(String(m.description).length, d.href).toBeLessThanOrEqual(158)
      expect(String(m.description).length, d.href).toBeGreaterThan(50)
    }
    expect(titles.size).toBe(docs.length)
  })

  it('every docs page exports its metadata for its own path and renders its structured data', () => {
    const dir = join(process.cwd(), 'app/(public)/docs')
    for (const d of readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory() && e.name !== '__tests__')) {
      const src = readFileSync(join(dir, d.name, 'page.tsx'), 'utf8')
      expect(src, d.name).toContain(`export const metadata = docMetadata('/docs/${d.name}')`)
      expect(src, d.name).toContain(`<DocPager href="/docs/${d.name}" />`)
    }
    expect(read('app/(public)/docs/pager.tsx')).toContain('<JsonLd data={docJsonLd(href)} />')
  })

  it('a docs page is a TechArticle about the product', () => {
    const [article, crumbs] = docJsonLd('/docs/bookings') as Array<Json>
    expect(article).toMatchObject({ '@type': 'TechArticle', headline: 'Bookings', url: absoluteUrl('/docs/bookings') })
    expect(crumbs.itemListElement.map((i: Json) => i.name)).toEqual(['Home', 'Docs', 'Bookings'])
  })
})

describe('blog: alt text and descriptions', () => {
  it('the meta description falls back: search field, then summary, then the body', () => {
    expect(postDescription(post({ seo_description: 'Search', excerpt: 'Summary' }))).toBe('Search')
    expect(postDescription(post({ excerpt: 'Summary' }))).toBe('Summary')
    expect(postDescription(post())).toBe('Start with the rate sheet.')
  })

  it('a cover image is never alt="" — its description, else the title', () => {
    expect(coverAlt(post({ cover_image_alt: 'A felucca at sunset' }))).toBe('A felucca at sunset')
    expect(coverAlt(post({ cover_image_alt: '  ' }))).toBe('Quoting a Nile cruise in ten minutes')
    for (const page of ['app/(public)/blog/page.tsx', 'app/(public)/blog/[slug]/page.tsx']) {
      const src = read(page)
      expect(src, page).not.toMatch(/<img [^>]*alt=""/)
      expect(src, page).toContain('alt={coverAlt(')
    }
  })

  it('body pictures without alt get the title; written alt text is kept', () => {
    const html = withImageAlts('<p><img src="/a.png"><img alt="" src="/b.png"><img src="/c.png" alt="Aswan"></p>', 'Tom & "Jerry"')
    expect(html).toBe('<p><img alt="Tom &amp; &quot;Jerry&quot;" src="/a.png"><img alt="" src="/b.png"><img src="/c.png" alt="Aswan"></p>')
    expect(read('app/(public)/blog/[slug]/page.tsx')).toContain('withImageAlts(sanitizeBlogHtml(post.body_html), post.title)')
  })

  it('a post is a BlogPosting by its author, published by the organisation', () => {
    const [article, crumbs] = postJsonLd(post({ cover_image_alt: 'Cover' })) as Array<Json>
    expect(article).toMatchObject({
      '@type': 'BlogPosting', headline: 'Quoting a Nile cruise in ten minutes', inLanguage: 'en',
      datePublished: '2026-09-01T08:00:00Z', dateModified: '2026-09-03T08:00:00Z',
      author: { '@type': 'Person', name: 'Sara' }, publisher: { '@id': ORG_ID },
      image: { '@type': 'ImageObject', url: 'https://cdn.example/cover.jpg', caption: 'Cover' },
    })
    expect(crumbs.itemListElement.map((i: Json) => i.name)).toEqual(['Home', 'Blog', 'Quoting a Nile cruise in ten minutes'])
    expect(postJsonLd(post({ author_name: null }))[0]).toMatchObject({ author: { '@type': 'Organization', '@id': ORG_ID } })
  })

  it('the editor saves the alt text and search description, trimmed and capped', () => {
    const r = validatePostInput({ title: 'T', body_html: '<p>x</p>', cover_image_alt: '  A view  ', seo_description: 'd'.repeat(400) })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.post.cover_image_alt).toBe('A view')
    expect(r.post.seo_description).toHaveLength(300)
    const empty = validatePostInput({ title: 'T' })
    expect(empty.ok && empty.post.cover_image_alt).toBeNull()
    const editor = read('app/super-admin/blog/[id]/page.tsx')
    expect(editor).toContain("set('cover_image_alt'")
    expect(editor).toContain("set('seo_description'")
    expect(read('components/blog/BlogEditor.tsx')).toContain("updateAttributes('image', { alt")
  })

  it('the reads select the new columns', () => {
    const src = read('lib/blog/posts.ts')
    expect(src).toMatch(/SUMMARY_COLUMNS = '[^']*seo_description[^']*cover_image_alt/)
  })
})

describe('migration 419', () => {
  let db: PGlite
  const mig = (n: string) => read(`supabase/migrations/${n}`)
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`create role anon; create role authenticated; create role service_role;`)
    await db.exec(mig('401_blog_posts.sql'))
    await db.exec(mig('419_blog_seo_fields.sql'))
  }, 60_000)

  it('replays, and caps both fields', async () => {
    await db.exec(mig('419_blog_seo_fields.sql'))
    await db.exec(`insert into blog_posts (slug, title, cover_image_alt, seo_description) values ('a', 'A', 'alt', 'desc')`)
    await expect(db.exec(`insert into blog_posts (slug, title, cover_image_alt) values ('b', 'B', repeat('x', 251))`)).rejects.toThrow()
    await expect(db.exec(`insert into blog_posts (slug, title, seo_description) values ('c', 'C', repeat('x', 301))`)).rejects.toThrow()
  })
})

describe('crawlers', () => {
  it('robots names the AI assistants and search engines, and closes the app and token links to all', () => {
    const r = robots()
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules]
    for (const bot of ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Googlebot', 'Bingbot']) {
      expect(AI_AND_SEARCH_CRAWLERS).toContain(bot)
    }
    for (const rule of rules) {
      for (const p of ['/api/', '/share/', '/staff/', '/portal/', '/super-admin']) expect(rule.disallow).toContain(p)
      expect(rule.allow).toContain('/llms.txt')
    }
    expect(PRIVATE_PATHS).not.toContain('/blog')
  })

  it('the sitemap lists every docs page from the table of contents', async () => {
    const urls = (await sitemap()).map(e => e.url)
    for (const d of CATEGORIES.flatMap(c => c.items).filter(i => i.href.startsWith('/docs/'))) {
      expect(urls).toContain(`${SITE_URL}${d.href}`)
    }
    expect(urls).toContain(`${SITE_URL}/blog`)
  })

  it('llms.txt says what Autoura is, with prices from the pricing config only', () => {
    const txt = llmsTxt()
    expect(txt.startsWith('# Autoura\n\n> ')).toBe(true)
    expect(txt).toContain('$69/month')
    expect(txt).toContain('$189/month')
    expect(txt).not.toContain('$449')
    expect(txt).toContain('not a travel agency')
    expect(txt).toContain(absoluteUrl('/llms-full.txt'))
  })

  it('llms-full.txt lists every docs page and each published post', () => {
    const txt = llmsFullTxt([post({ seo_description: 'How to quote fast.' })])
    for (const d of CATEGORIES.flatMap(c => c.items)) expect(txt).toContain(absoluteUrl(d.href))
    expect(txt).toContain(`[Quoting a Nile cruise in ten minutes](${absoluteUrl('/blog/nile-quotes')}) (2026-09-01): How to quote fast.`)
    expect(llmsFullTxt([])).toContain('No posts published yet.')
  })

  it('/llms.txt and /llms-full.txt are public and served as markdown', () => {
    const mw = read('middleware.ts')
    expect(mw).toContain("'/llms.txt', '/llms-full.txt',")
    for (const f of ['app/llms.txt/route.ts', 'app/llms-full.txt/route.ts']) {
      expect(existsSync(join(process.cwd(), f)), f).toBe(true)
      expect(read(f)).toContain("'Content-Type': 'text/markdown; charset=utf-8'")
    }
  })
})
