// One published blog post. Drafts and unknown slugs are a 404. The body is
// sanitised on save and again here (lib/blog/sanitize.ts).

import { cache } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPublishedPost, readingMinutes, listPublishedPosts } from '@/lib/blog/posts'
import { sanitizeBlogHtml } from '@/lib/blog/sanitize'
import { currentUser, isBlogAdmin } from '@/lib/blog/admin'
import { BlogHeader, BlogFooter, fmtPostDate } from '@/components/blog/BlogChrome'
import JsonLd from '@/components/seo/JsonLd'
import { coverAlt, postDescription, postJsonLd, withImageAlts } from '@/lib/blog/seo'
import { buildPageMetadata } from '@/lib/seo/site'

export const dynamic = 'force-dynamic'

// One read per request, shared by the metadata and the page.
const loadPost = cache((slug: string) => getPublishedPost(slug))

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = (await params).slug
  const post = await loadPost(slug)
  if (!post) return { title: 'Post not found', robots: { index: false, follow: true } }
  return buildPageMetadata({
    title: post.title,
    description: postDescription(post),
    path: `/blog/${post.slug}`,
    type: 'article',
    locale: post.language === 'ja' ? 'ja_JP' : 'en_US',
    image: post.cover_image_url ? { url: post.cover_image_url, alt: coverAlt(post) } : null,
    publishedTime: post.published_at,
    modifiedTime: post.updated_at,
    authors: post.author_name ? [post.author_name] : [],
  })
}

export default async function BlogPostPage({ params }: Props) {
  const post = await loadPost((await params).slug)
  if (!post) notFound()

  const [user, more] = await Promise.all([currentUser(), listPublishedPosts({ language: post.language, limit: 4 })])
  const admin = isBlogAdmin(user?.email)
  const body = withImageAlts(sanitizeBlogHtml(post.body_html), post.title)
  const others = more.filter(p => p.id !== post.id).slice(0, 3)

  return (
    <div className="min-h-screen bg-[#F5F3EF]">
      <BlogHeader adminHref={admin ? `/super-admin/blog/${post.id}` : null} adminLabel="Edit post" />

      <JsonLd data={postJsonLd(post)} />
      <main>
        <article lang={post.language} className="max-w-3xl mx-auto px-4 sm:px-6 pt-12" data-testid="blog-post">
          <Link href="/blog" className="text-sm font-medium text-[#647C47] hover:underline">← All posts</Link>
          <p className="mt-6 text-sm text-gray-500">
            {post.published_at && <time dateTime={post.published_at}>{fmtPostDate(post.published_at, post.language)}</time>}
            {' · '}{post.language === 'ja' ? `${readingMinutes(post.body_html)}分で読めます` : `${readingMinutes(post.body_html)} min read`}
            {post.author_name && <> · {post.author_name}</>}
          </p>
          <h1 className="mt-2 text-4xl sm:text-5xl font-bold leading-tight tracking-tight text-[#111710]">{post.title}</h1>
          {post.excerpt && <p className="mt-4 text-xl leading-relaxed text-gray-600">{post.excerpt}</p>}
          {post.tags.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-2">
              {post.tags.map(tag => (
                <li key={tag} className="px-2.5 py-1 rounded-full bg-[#647C47]/10 text-xs font-medium text-[#647C47]">{tag}</li>
              ))}
            </ul>
          )}
          {post.cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.cover_image_url} alt={coverAlt(post)} className="mt-8 w-full rounded-2xl" />
          )}
          <div className="blog-prose mt-10" dangerouslySetInnerHTML={{ __html: body }} />
        </article>

        <section className="max-w-3xl mx-auto px-4 sm:px-6 mt-16">
          <div className="rounded-2xl bg-[#647C47]/5 border border-[#647C47]/15 p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-[#111710]">Run your tours on Autoura</h2>
            <p className="mt-2 text-gray-600">Quotes, itineraries, bookings, suppliers and payments in one place — built by people who run tours.</p>
            <Link href="/contact"
              className="mt-4 inline-block px-5 py-2.5 bg-[#647C47] text-white text-sm font-semibold rounded-[9px] hover:bg-[#4f6339]">
              Apply for the Assisted Pilot
            </Link>
          </div>
        </section>

        {others.length > 0 && (
          <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-16">
            <h2 className="text-lg font-semibold text-[#111710]">More from the blog</h2>
            <div className="mt-5 grid gap-8 sm:grid-cols-3">
              {others.map(p => (
                <Link key={p.id} href={`/blog/${p.slug}`} className="group" lang={p.language}>
                  {p.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.cover_image_url} alt={coverAlt(p)} loading="lazy" className="w-full aspect-[16/9] object-cover rounded-xl bg-gray-100" />
                  ) : (
                    <div className="w-full aspect-[16/9] rounded-xl bg-gradient-to-br from-[#647C47]/15 to-[#647C47]/5" />
                  )}
                  <p className="mt-3 text-xs text-gray-500">{p.published_at && <time dateTime={p.published_at}>{fmtPostDate(p.published_at, p.language)}</time>}</p>
                  <h3 className="mt-1 font-semibold leading-snug text-[#111710] group-hover:text-[#647C47]">{p.title}</h3>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <BlogFooter />
    </div>
  )
}
