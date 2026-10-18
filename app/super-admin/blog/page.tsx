'use client'

// The product blog's posts, for super admins (SUPER_ADMIN_EMAILS):
// drafts and published, newest edit first. Anyone else is told they cannot
// manage the blog — the API refuses them either way.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, ExternalLink, Loader2, Newspaper } from 'lucide-react'

interface PostRow {
  id: string
  slug: string
  language: string
  title: string
  status: 'draft' | 'published'
  published_at: string | null
  updated_at: string
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—')

export default function BlogAdminPage() {
  const [posts, setPosts] = useState<PostRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    fetch('/api/super-admin/blog')
      .then(async res => {
        const data = await res.json().catch(() => ({}))
        if (res.status === 401 || res.status === 403) { setDenied(true); return }
        if (!res.ok || !data.success) throw new Error(data.error || 'Could not load the posts')
        setPosts(data.posts)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load the posts'))
  }, [])

  if (denied) {
    return (
      <div className="p-6 max-w-xl">
        <h1 className="text-xl font-semibold text-gray-900">Blog</h1>
        <p className="mt-2 text-sm text-gray-600">Only super admins can manage the blog. Ask for your email to be added to SUPER_ADMIN_EMAILS.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Blog</h1>
          <p className="text-sm text-gray-500">Posts on the public blog at /blog — product news, how-tos and tips for tour operators.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/blog" target="_blank" className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
            <ExternalLink className="w-4 h-4" /> View blog
          </Link>
          <Link href="/super-admin/blog/new" className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700">
            <Plus className="w-4 h-4" /> New post
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {!posts ? (
        !error && <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : posts.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center">
          <Newspaper className="w-8 h-8 text-gray-300 mx-auto" />
          <p className="mt-3 text-sm text-gray-600">No posts yet.</p>
          <Link href="/super-admin/blog/new" className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700">
            <Plus className="w-4 h-4" /> Write the first post
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Language</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Published</th>
                <th className="px-4 py-2.5 font-medium">Updated</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {posts.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/super-admin/blog/${p.id}`} className="font-medium text-gray-900 hover:text-primary-700">{p.title}</Link>
                    <div className="text-xs text-gray-400">/blog/{p.slug}</div>
                  </td>
                  <td className="px-4 py-3 uppercase text-gray-600">{p.language}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${p.status === 'published' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {p.status === 'published' ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{fmtDate(p.status === 'published' ? p.published_at : null)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtDate(p.updated_at)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link href={`/super-admin/blog/${p.id}`} className="text-primary-600 hover:underline">Edit</Link>
                    {p.status === 'published' && (
                      <Link href={`/blog/${p.slug}`} target="_blank" className="ml-3 text-gray-500 hover:underline">View</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
