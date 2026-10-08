'use client'

// Write or edit one blog post (super admins). /super-admin/blog/new starts a
// fresh one. The slug follows the title until it is edited by hand; saving
// as draft keeps it off the public blog, Publish puts it there.

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowLeft, Loader2, ImagePlus, X, ExternalLink, Trash2 } from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { slugify } from '@/lib/blog/posts-shared'
import { uploadBlogImage } from '@/lib/blog/upload-client'

// The editor is browser-only (it measures the DOM).
const BlogEditor = dynamic(() => import('@/components/blog/BlogEditor'), { ssr: false })

interface Draft {
  title: string
  slug: string
  language: 'en' | 'ja'
  excerpt: string
  body_html: string
  cover_image_url: string
  author_name: string
  tags: string
  status: 'draft' | 'published'
}

const EMPTY: Draft = { title: '', slug: '', language: 'en', excerpt: '', body_html: '', cover_image_url: '', author_name: '', tags: '', status: 'draft' }

export default function BlogPostEditorPage() {
  const router = useRouter()
  const { confirm } = useConfirmDialog()
  const id = String(useParams().id)
  const isNew = id === 'new'

  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [slugEdited, setSlugEdited] = useState(!isNew)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    if (isNew) return
    fetch(`/api/super-admin/blog/${id}`)
      .then(async res => {
        const data = await res.json().catch(() => ({}))
        if (res.status === 401 || res.status === 403) { setDenied(true); return }
        if (!res.ok || !data.success) throw new Error(data.error || 'Could not load the posts')
        const p = data.post
        setDraft({
          title: p.title ?? '', slug: p.slug ?? '', language: p.language === 'ja' ? 'ja' : 'en',
          excerpt: p.excerpt ?? '', body_html: p.body_html ?? '', cover_image_url: p.cover_image_url ?? '',
          author_name: p.author_name ?? '', tags: (p.tags ?? []).join(', '), status: p.status,
        })
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load the posts'))
      .finally(() => setLoading(false))
  }, [id, isNew])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(d => ({ ...d, [key]: value }))
  const setTitle = (title: string) => setDraft(d => ({ ...d, title, slug: slugEdited ? d.slug : slugify(title) }))

  const save = async (status: 'draft' | 'published') => {
    if (saving) return
    setSaving(true); setError(null); setNotice(null)
    try {
      const res = await fetch(isNew ? '/api/super-admin/blog' : `/api/super-admin/blog/${id}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, status, tags: draft.tags.split(',').map(s => s.trim()).filter(Boolean) }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401 || res.status === 403) { setDenied(true); return }
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not save the post')
      setDraft(d => ({ ...d, status: data.post.status, slug: data.post.slug, body_html: data.post.body_html }))
      setNotice(status === 'published' ? 'Published on the blog.' : 'Saved as a draft — not on the blog.')
      if (isNew) router.replace(`/super-admin/blog/${data.post.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the post')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!(await confirm({ message: 'It disappears from the blog and cannot be restored.', title: 'Delete this post?', confirmText: 'Delete post', variant: 'danger' }))) return
    const res = await fetch(`/api/super-admin/blog/${id}`, { method: 'DELETE' })
    if (res.ok) router.push('/super-admin/blog')
    else setError('Could not delete the post')
  }

  const setCover = async (file: File | undefined) => {
    if (!file) return
    setUploadingCover(true); setError(null)
    try { set('cover_image_url', await uploadBlogImage(file)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not upload the image') }
    finally { setUploadingCover(false) }
  }

  if (denied) {
    return <div className="p-6 max-w-xl"><p className="text-sm text-gray-600">Only super admins can manage the blog. Ask for your email to be added to SUPER_ADMIN_EMAILS.</p></div>
  }
  if (loading) {
    return <div className="p-6 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
  }

  const published = draft.status === 'published'
  const input = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/super-admin/blog" className="p-2 -ml-2 rounded-lg hover:bg-gray-100" title="All posts" aria-label="All posts">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <h1 className="text-xl font-semibold text-gray-900 truncate">{isNew ? 'New post' : 'Edit post'}</h1>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${published ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            {published ? 'Published' : 'Draft'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isNew && published && (
            <Link href={`/blog/${draft.slug}`} target="_blank" className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
              <ExternalLink className="w-4 h-4" /> View
            </Link>
          )}
          <button type="button" onClick={() => save('draft')} disabled={saving} className="px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {published ? 'Unpublish' : 'Save draft'}
          </button>
          <button type="button" onClick={() => save('published')} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} {published ? 'Update' : 'Publish'}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600" role="alert">{error}</p>}
      {notice && <p className="mb-4 text-sm text-green-700" role="status">✓ {notice}</p>}

      <div className="space-y-4">
        <input value={draft.title} onChange={e => setTitle(e.target.value)} placeholder="Post title" maxLength={200}
          className="w-full px-3 py-2.5 text-2xl font-semibold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="sm:col-span-2 text-xs font-medium text-gray-600">URL
            <div className="mt-1 flex items-center rounded-lg border border-gray-300 focus-within:ring-2 focus-within:ring-primary-500">
              <span className="pl-3 text-sm text-gray-400">/blog/</span>
              <input value={draft.slug} onChange={e => { setSlugEdited(true); set('slug', e.target.value.toLowerCase()) }} placeholder="my-post" maxLength={120}
                className="flex-1 px-1 py-2 text-sm bg-transparent focus:outline-none" />
            </div>
            <span className="mt-1 block font-normal text-gray-400">Lowercase letters, digits and hyphens. Changing it breaks links already shared.</span>
          </label>
          <label className="text-xs font-medium text-gray-600">Language
            <select value={draft.language} onChange={e => set('language', e.target.value as Draft['language'])} className={`mt-1 ${input} bg-white`}>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </label>
        </div>

        <label className="block text-xs font-medium text-gray-600">Summary
          <textarea value={draft.excerpt} onChange={e => set('excerpt', e.target.value)} rows={2} maxLength={500} placeholder="One or two sentences shown on the blog list and in link previews." className={`mt-1 ${input}`} />
        </label>

        <div className="text-xs font-medium text-gray-600">
          Cover image
          {draft.cover_image_url ? (
            <div className="mt-1 relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={draft.cover_image_url} alt="" className="w-full max-h-64 object-cover rounded-lg border border-gray-200" />
              <button type="button" onClick={() => set('cover_image_url', '')} className="absolute top-2 right-2 p-1.5 rounded-full bg-white/90 shadow hover:bg-white" title="Remove the cover image" aria-label="Remove the cover image">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="mt-1 flex items-center justify-center gap-2 h-24 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 cursor-pointer hover:bg-gray-50">
              {uploadingCover ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
              Add a cover image
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={e => setCover(e.target.files?.[0])} />
            </label>
          )}
        </div>

        <BlogEditor value={draft.body_html} onChange={html => set('body_html', html)} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs font-medium text-gray-600">Author
            <input value={draft.author_name} onChange={e => set('author_name', e.target.value)} maxLength={120} placeholder="Name shown on the post" className={`mt-1 ${input}`} />
          </label>
          <label className="text-xs font-medium text-gray-600">Tags
            <input value={draft.tags} onChange={e => set('tags', e.target.value)} placeholder="Comma-separated, e.g. product, how-to" className={`mt-1 ${input}`} />
          </label>
        </div>

        {!isNew && (
          <div className="pt-4 border-t border-gray-200">
            <button type="button" onClick={remove} className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700">
              <Trash2 className="w-4 h-4" /> Delete post
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
