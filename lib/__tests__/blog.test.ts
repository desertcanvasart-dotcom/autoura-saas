// The product blog: post HTML is made safe, input is checked, and only
// super admins can write — and the public pages are public. Ported from
// travel-ops-pro.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { sanitizeBlogHtml } from '@/lib/blog/sanitize'
import { slugify, isValidSlug, validatePostInput, readingMinutes } from '@/lib/blog/posts'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('sanitizeBlogHtml', () => {
  it('keeps what the editor writes', () => {
    const html = '<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em>.</p><ul><li>one</li></ul><blockquote><p>q</p></blockquote><pre><code>x</code></pre><img src="https://cdn.example/a.png" alt="a">'
    expect(sanitizeBlogHtml(html)).toBe(html)
  })

  it('strips script, styles, handlers and frames — on the server too', () => {
    const out = sanitizeBlogHtml('<p onclick="x()" style="color:red">hi</p><script>alert(1)</script><iframe src="https://x"></iframe><style>p{}</style>')
    expect(out).toBe('<p>hi</p>')
  })

  it('drops javascript: and data: URLs, and an image left with no source', () => {
    expect(sanitizeBlogHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeBlogHtml('<img src="data:image/png;base64,AAAA">')).toBe('')
    expect(sanitizeBlogHtml('<a href="//evil.example">x</a>')).toBe('<a>x</a>')
  })

  it('an outside link opens in a new tab without our window; an inside one does not', () => {
    expect(sanitizeBlogHtml('<a href="https://example.com">x</a>')).toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>')
    expect(sanitizeBlogHtml('<a href="/docs" target="_blank">x</a>')).toBe('<a href="/docs">x</a>')
  })

  it('empty in, empty out', () => {
    expect(sanitizeBlogHtml(null)).toBe('')
    expect(sanitizeBlogHtml('')).toBe('')
  })
})

describe('slugs', () => {
  it('a title becomes a URL slug', () => {
    expect(slugify('How to quote a 10-day Nile trip — fast!')).toBe('how-to-quote-a-10-day-nile-trip-fast')
    expect(slugify('Café & Crème')).toBe('cafe-creme')
    expect(slugify('ナイル川クルーズ')).toBe('')
  })

  it('only lowercase words and hyphens are valid', () => {
    expect(isValidSlug('release-notes-2026')).toBe(true)
    for (const bad of ['', 'Upper', 'a--b', '-a', 'a-', 'a b', 'a/b']) expect(isValidSlug(bad)).toBe(false)
  })
})

describe('validatePostInput', () => {
  it('cleans a post: slug from the title, tags tidied, body sanitised, unknowns defaulted', () => {
    const r = validatePostInput({
      title: '  Release notes  ', body_html: '<p>New</p><script>x</script>', tags: [' Product ', 'product', ''],
      language: 'fr', status: 'live', cover_image_url: 'javascript:alert(1)',
    })
    expect(r).toEqual({
      ok: true,
      post: {
        title: 'Release notes', slug: 'release-notes', language: 'en', excerpt: null, body_html: '<p>New</p>',
        cover_image_url: null, author_name: null, tags: ['product'], status: 'draft',
      },
    })
  })

  it('refuses a post with no title, or a Japanese title with no slug given', () => {
    expect(validatePostInput({ title: '' })).toMatchObject({ ok: false })
    expect(validatePostInput({ title: 'ナイル川' })).toMatchObject({ ok: false })
    expect(validatePostInput({ title: 'ナイル川', slug: 'nile-cruise' })).toMatchObject({ ok: true, post: { slug: 'nile-cruise' } })
  })

  it('a cover image must be https', () => {
    const r = validatePostInput({ title: 'x', cover_image_url: 'https://cdn.example/c.jpg' })
    expect(r.ok && r.post.cover_image_url).toBe('https://cdn.example/c.jpg')
    const http = validatePostInput({ title: 'x', cover_image_url: 'http://cdn.example/c.jpg' })
    expect(http.ok && http.post.cover_image_url).toBeNull()
  })
})

describe('readingMinutes', () => {
  it('counts English words and Japanese characters, at least a minute', () => {
    expect(readingMinutes('<p>short</p>')).toBe(1)
    expect(readingMinutes(`<p>${'word '.repeat(1100)}</p>`)).toBe(5)
    expect(readingMinutes(`<p>${'あ'.repeat(2500)}</p>`)).toBe(5)
  })
})

describe('wiring', () => {
  const routes = (dir: string): string[] =>
    readdirSync(dir).flatMap(f => {
      const p = join(dir, f)
      return statSync(p).isDirectory() ? routes(p) : f === 'route.ts' ? [p] : []
    })

  it('every super-admin blog API route refuses anyone but a super admin before touching data', () => {
    const files = routes(join(process.cwd(), 'app/api/super-admin/blog'))
    expect(files.length).toBe(3)
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      for (const handler of src.split(/export async function /).slice(1)) {
        const guard = handler.search(/requireSuperAdmin\(\)|await guard\(ctx\)/)
        const data = handler.search(/createServiceClient\(\)/)
        expect(guard, `${file}: ${handler.slice(0, 20)}`).toBeGreaterThan(-1)
        expect(guard).toBeLessThan(data === -1 ? Infinity : data)
      }
    }
  })

  it('the public pages are public, show no sidebar, and are in the sitemap and robots', () => {
    expect(read('middleware.ts')).toContain("'/blog',")
    const shell = read('app/ClientShell.tsx')
    expect(shell).toMatch(/const publicPages = \[[^\]]*'\/blog'/)
    expect(shell).toContain("pathname.startsWith('/blog/')")
    expect(read('app/robots.ts')).toContain("'/blog'")
    const sitemap = read('app/sitemap.ts')
    expect(sitemap).toContain("'/blog'")
    expect(sitemap).toContain('listPublishedPosts(')
  })

  it('the editor is in the super-admin nav', () => {
    expect(read('app/super-admin/layout.tsx')).toContain("href: '/super-admin/blog'")
  })

  it('the public pages read only published posts, and render the body sanitised', () => {
    const posts = read('lib/blog/posts.ts')
    expect(posts.match(/\.eq\('status', 'published'\)/g)?.length).toBe(2)
    expect(read('app/(public)/blog/[slug]/page.tsx')).toContain('sanitizeBlogHtml(post.body_html)')
  })

  it('the landing page links to the blog', () => {
    expect(read('app/page.tsx').match(/href="\/blog"/g)?.length).toBe(3)
  })
})
