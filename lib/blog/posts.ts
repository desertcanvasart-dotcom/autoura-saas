// The product blog's posts: shape, validation, and reads for the public pages.
//
// The table (supabase/migrations/401_blog_posts.sql) is server-only, so every
// read and write goes through the service role here or in the super-admin
// API — never from a visitor's browser. Ported from travel-ops-pro.

import { blogDb as createServiceClient } from './db'
import { sanitizeBlogHtml } from './sanitize'

export * from './posts-shared'
import { BLOG_LANGUAGES, isValidSlug, slugify, type BlogLanguage, type BlogPost, type BlogPostSummary } from './posts-shared'

const SUMMARY_COLUMNS = 'id, slug, language, title, excerpt, cover_image_url, author_name, tags, status, published_at, created_at, updated_at'
/** Every column a post page or the editor needs. */
export const POST_COLUMNS = `${SUMMARY_COLUMNS}, body_html`

export type PostInput = {
  title: string
  slug: string
  language: BlogLanguage
  excerpt: string | null
  body_html: string
  cover_image_url: string | null
  author_name: string | null
  tags: string[]
  status: 'draft' | 'published'
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const optional = (v: unknown, max: number) => {
  const s = str(v)
  return s ? s.slice(0, max) : null
}
const safeImageUrl = (v: unknown) => {
  const s = str(v)
  return /^https:\/\//i.test(s) ? s.slice(0, 1000) : null
}

/** A post from the editor, checked and cleaned; or what is wrong with it. */
export function validatePostInput(body: unknown): { ok: true; post: PostInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const title = str(b.title).slice(0, 200)
  if (!title) return { ok: false, error: 'A post needs a title' }
  const slug = str(b.slug).toLowerCase() || slugify(title)
  if (!isValidSlug(slug)) return { ok: false, error: 'The URL slug may use only lowercase letters, digits and hyphens' }
  const language = BLOG_LANGUAGES.includes(b.language as BlogLanguage) ? (b.language as BlogLanguage) : 'en'
  const status = b.status === 'published' ? 'published' : 'draft'
  const tags = Array.isArray(b.tags)
    ? [...new Set(b.tags.map(t => str(t).toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 10)
    : []
  return {
    ok: true,
    post: {
      title,
      slug,
      language,
      excerpt: optional(b.excerpt, 500),
      body_html: sanitizeBlogHtml(typeof b.body_html === 'string' ? b.body_html : ''),
      cover_image_url: safeImageUrl(b.cover_image_url),
      author_name: optional(b.author_name, 120),
      tags,
      status,
    },
  }
}

/** Published posts, newest first, optionally in one language. */
export async function listPublishedPosts(opts: { language?: BlogLanguage; limit?: number } = {}): Promise<BlogPostSummary[]> {
  try {
    let q = createServiceClient()
      .from('blog_posts')
      .select(SUMMARY_COLUMNS)
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .limit(opts.limit ?? 50)
    if (opts.language) q = q.eq('language', opts.language)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as BlogPostSummary[]
  } catch (e) {
    // The blog is a page of the public site; a missing table or key must not
    // take it down. It shows "no posts yet" and the reason goes to the log.
    console.error('[blog] listing published posts failed:', e)
    return []
  }
}

/** One published post by its slug, or null. */
export async function getPublishedPost(slug: string): Promise<BlogPost | null> {
  if (!isValidSlug(slug)) return null
  try {
    const { data, error } = await createServiceClient()
      .from('blog_posts')
      .select(POST_COLUMNS)
      .eq('slug', slug)
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .maybeSingle()
    if (error) throw error
    return data as BlogPost | null
  } catch (e) {
    console.error('[blog] reading a post failed:', e)
    return null
  }
}
