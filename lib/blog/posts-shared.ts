// The blog's shared pieces — types, slugs, reading time — safe for the
// browser too (lib/blog/posts.ts is server-side: it sanitises and reads the
// table).

export const BLOG_LANGUAGES = ['en', 'ja'] as const
export type BlogLanguage = (typeof BLOG_LANGUAGES)[number]

export interface BlogPost {
  id: string
  slug: string
  language: BlogLanguage
  title: string
  excerpt: string | null
  body_html: string
  cover_image_url: string | null
  author_name: string | null
  tags: string[]
  status: 'draft' | 'published'
  published_at: string | null
  created_at: string
  updated_at: string
}

export type BlogPostSummary = Omit<BlogPost, 'body_html'>

export const SLUG_TAKEN = 'That URL is already used by another post — change the slug'
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** A URL slug from a title: lowercase ASCII words joined by hyphens. Empty for a title with no Latin letters or digits (a Japanese title) — the editor then asks for one. */
export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 120 && SLUG_RE.test(slug)
}

/** Minutes to read, from the text (Japanese counted by characters). */
export function readingMinutes(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ')
  const cjk = (text.match(/[぀-ヿ㐀-鿿]/g) ?? []).length
  const words = text.replace(/[぀-ヿ㐀-鿿]/g, ' ').split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 220 + cjk / 500))
}
