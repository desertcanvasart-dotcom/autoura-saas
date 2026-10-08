// The public product blog: published posts, newest first, in either language
// or both (?lang=en|ja). Rendered on the server for search engines; the table
// is read with the service role (lib/blog/posts.ts), never from the browser.

import type { Metadata } from 'next'
import Link from 'next/link'
import { listPublishedPosts, type BlogLanguage } from '@/lib/blog/posts'
import { currentUser, isBlogAdmin } from '@/lib/blog/admin'
import { BlogHeader, BlogFooter, fmtPostDate } from '@/components/blog/BlogChrome'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Blog — Autoura',
  description: 'Product news, how-tos and operations tips for tour operators and travel agencies, from the Autoura team.',
  openGraph: { title: 'Autoura Blog', description: 'Product news, how-tos and operations tips for tour operators.', type: 'website' },
}

const LANGS: { value: BlogLanguage | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
]

export default async function BlogIndexPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams
  const language = lang === 'en' || lang === 'ja' ? lang : undefined
  const [posts, user] = await Promise.all([listPublishedPosts({ language }), currentUser()])
  const admin = isBlogAdmin(user?.email)
  const [lead, ...rest] = posts

  return (
    <div className="min-h-screen bg-[#F5F3EF]">
      <BlogHeader adminHref={admin ? '/super-admin/blog' : null} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6">
        <section className="pt-14 pb-8">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[#111710]">Blog</h1>
          <p className="mt-3 max-w-2xl text-lg text-gray-600">
            Product news, how-tos and lessons from running tours — for operators and travel agencies.
          </p>
          <div className="mt-6 flex gap-2" role="tablist" aria-label="Language">
            {LANGS.map(l => {
              const active = (l.value ?? undefined) === language
              return (
                <Link key={l.label} href={l.value ? `/blog?lang=${l.value}` : '/blog'} role="tab" aria-selected={active}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border ${active ? 'bg-[#647C47] text-white border-[#647C47]' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {l.label}
                </Link>
              )
            })}
          </div>
        </section>

        {!lead ? (
          <p className="py-20 text-center text-gray-500" data-testid="blog-empty">No posts yet — check back soon.</p>
        ) : (
          <>
            <Link href={`/blog/${lead.slug}`} className="group grid md:grid-cols-2 gap-8 items-center py-6" data-testid="blog-lead">
              {lead.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lead.cover_image_url} alt="" className="w-full aspect-[16/9] object-cover rounded-2xl bg-gray-100" />
              ) : (
                <div className="w-full aspect-[16/9] rounded-2xl bg-gradient-to-br from-[#647C47]/15 to-[#647C47]/5" />
              )}
              <div lang={lead.language}>
                <PostMeta date={lead.published_at} language={lead.language} tags={lead.tags} />
                <h2 className="mt-2 text-3xl font-bold leading-tight text-[#111710] group-hover:text-[#647C47]">{lead.title}</h2>
                {lead.excerpt && <p className="mt-3 text-gray-600 text-lg leading-relaxed">{lead.excerpt}</p>}
                <span className="mt-4 inline-block text-sm font-semibold text-[#647C47]">Read the post →</span>
              </div>
            </Link>

            {rest.length > 0 && (
              <div className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map(p => (
                  <Link key={p.id} href={`/blog/${p.slug}`} className="group" lang={p.language}>
                    {p.cover_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.cover_image_url} alt="" className="w-full aspect-[16/9] object-cover rounded-xl bg-gray-100" />
                    ) : (
                      <div className="w-full aspect-[16/9] rounded-xl bg-gradient-to-br from-[#647C47]/15 to-[#647C47]/5" />
                    )}
                    <div className="mt-4"><PostMeta date={p.published_at} language={p.language} tags={p.tags} /></div>
                    <h2 className="mt-1.5 text-xl font-semibold leading-snug text-[#111710] group-hover:text-[#647C47]">{p.title}</h2>
                    {p.excerpt && <p className="mt-2 text-gray-600 line-clamp-3">{p.excerpt}</p>}
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <BlogFooter />
    </div>
  )
}

function PostMeta({ date, language, tags }: { date: string | null; language: string; tags: string[] }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
      {fmtPostDate(date, language)}
      {tags[0] && <span className="text-[#647C47]"> · {tags[0]}</span>}
    </p>
  )
}

