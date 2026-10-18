// ============================================
// Blog posts as search engines and AI assistants read them
// ============================================
// The meta description, the image alt text and the BlogPosting data for a
// post, each with a fallback so a post written without them still reads
// well: a description from the search field, else the summary, else the
// opening of the body; a cover's alt from its own field, else the title.

import type { BlogPost, BlogPostSummary } from './posts-shared'
import { absoluteUrl, breadcrumbs, ORG_ID, plainDescription, SITE_NAME, SOFTWARE_ID } from '@/lib/seo/site'

/** The search-result snippet for a post. */
export function postDescription(post: Pick<BlogPost, 'seo_description' | 'excerpt'> & { body_html?: string | null }): string {
  return plainDescription(post.seo_description || post.excerpt || post.body_html || '')
}

/** What a post's cover image shows. Never empty: the title stands in. */
export function coverAlt(post: Pick<BlogPostSummary, 'cover_image_alt' | 'title'>): string {
  return (post.cover_image_alt ?? '').trim() || post.title
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Pictures in a post body that carry no alt attribute get the post title, so
 * none is announced as a bare file name. An explicit alt — including alt=""
 * for a decorative picture — is left as written.
 */
export function withImageAlts(html: string, fallback: string): string {
  return html.replace(/<img\b(?![^>]*\balt=)/gi, `<img alt="${escapeAttr(fallback)}"`)
}

/** BlogPosting + BreadcrumbList for a post page. */
export function postJsonLd(post: BlogPost) {
  const url = absoluteUrl(`/blog/${post.slug}`)
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: postDescription(post),
      url,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      inLanguage: post.language,
      ...(post.published_at ? { datePublished: post.published_at } : {}),
      dateModified: post.updated_at || post.published_at || undefined,
      ...(post.cover_image_url
        ? { image: { '@type': 'ImageObject', url: post.cover_image_url, caption: coverAlt(post) } }
        : {}),
      author: post.author_name
        ? { '@type': 'Person', name: post.author_name }
        : { '@type': 'Organization', name: SITE_NAME, '@id': ORG_ID },
      publisher: { '@id': ORG_ID },
      about: { '@id': SOFTWARE_ID },
      ...(post.tags.length ? { keywords: post.tags.join(', ') } : {}),
    },
    breadcrumbs([
      { name: 'Blog', path: '/blog' },
      { name: post.title, path: `/blog/${post.slug}` },
    ]),
  ]
}
