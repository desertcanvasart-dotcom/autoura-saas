'use client'
// ============================================
// Publish — the agency's Google reviews on its website
// ============================================
// Operator, 2026-10-27: import the agency's Google reviews. The agency finds
// its business on Google and picks it; the website then shows its rating and
// up to five reviews (Google's limit), credited and linked as Google asks
// (lib/publish/reviews.ts). Real reviews only — nothing is written here.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Star, Search } from 'lucide-react'
import { useRole } from '@/hooks/useRole'
import { showToast } from '@/app/contexts/ToastContext'

interface Preview { name: string; rating: number | null; count: number | null; reviews: Array<{ author: string; rating: number; text: string; when: string }> }
interface State { placeId: string | null; show: boolean; ready: boolean; preview: Preview | null }
interface Hit { placeId: string; name: string; address: string }

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  const j = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }))
  if (!j.success) throw new Error(j.error || 'Something went wrong')
  return j.data
}

export default function PublishReviewsPage() {
  const { isAdmin, isManager } = useRole()
  const canManage = isAdmin || isManager
  const [state, setState] = useState<State | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [busy, setBusy] = useState(false)

  const load = () => call('/api/publish/reviews').then(setState).catch(e => showToast('error', e.message))
  useEffect(() => { load() }, [])

  async function search() {
    setBusy(true)
    try { setHits((await call('/api/publish/reviews', { method: 'POST', body: JSON.stringify({ query }) })).places) } catch (e) { showToast('error', e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }
  async function save(placeId: string | null, show = true) {
    setBusy(true)
    try {
      const r = await call('/api/publish/reviews', { method: 'PUT', body: JSON.stringify({ placeId, show }) })
      showToast(r.warning ? 'warning' : 'success', r.warning ?? (placeId ? (show ? 'Your reviews now show on your website' : 'Reviews hidden') : 'Disconnected'))
      setHits([])
      await load()
    } catch (e) { showToast('error', e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  if (!state) return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" /></div>

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <Link href="/publish" className="inline-flex items-center gap-1 text-sm text-primary-500"><ArrowLeft className="h-4 w-4" />Website</Link>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary-500/10 rounded-lg flex items-center justify-center"><Star className="h-5 w-5 text-primary-500" /></div>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Google reviews</h1>
          <p className="text-sm text-gray-500">Show your Google rating and your latest reviews on your website — exactly as they are on Google.</p>
        </div>
      </div>

      {!state.ready ? (
        <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded-lg p-4">Not switched on yet for your company — contact Autoura.</p>
      ) : (
        <>
          {state.placeId && (
            <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900">{state.preview?.name ?? 'Your business'}</p>
                  {state.preview?.rating != null && <p className="text-sm text-gray-600">{state.preview.rating.toFixed(1)} ★ · {state.preview.count ?? 0} reviews on Google</p>}
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => save(state.placeId, !state.show)} className="text-sm px-3 py-1.5 rounded-md border border-gray-300">{state.show ? 'Hide on my website' : 'Show on my website'}</button>
                    <button type="button" disabled={busy} onClick={() => confirm('Disconnect your Google business?') && save(null)} className="text-sm px-3 py-1.5 rounded-md border border-gray-300 text-red-700">Disconnect</button>
                  </div>
                )}
              </div>
              {state.preview && state.preview.reviews.length > 0 ? (
                <ul className="space-y-2">
                  {state.preview.reviews.map((r, i) => (
                    <li key={i} className="text-sm border border-gray-100 rounded p-2">
                      <p className="font-medium">{r.author} · {'★'.repeat(Math.round(r.rating))} <span className="text-gray-400 font-normal">{r.when}</span></p>
                      <p className="text-gray-700 line-clamp-3">{r.text}</p>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-gray-500">Google returned no reviews for this business yet.</p>}
              <p className="text-xs text-gray-500">Google shares at most five reviews, chosen by Google. They show credited to their authors, linked to Google Maps, and are never edited.</p>
            </section>
          )}

          {canManage && (
            <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
              <h2 className="font-medium text-gray-900">{state.placeId ? 'Choose a different business' : 'Find your business on Google'}</h2>
              <div className="flex gap-2">
                <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} placeholder="Your business name and city, e.g. Sunrise Travel Cairo"
                  className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-2" />
                <button type="button" disabled={busy || query.trim().length < 3} onClick={search} className="inline-flex items-center gap-1 text-sm px-3 py-2 rounded-md bg-primary-500 text-white disabled:opacity-40"><Search className="h-4 w-4" />Search</button>
              </div>
              {hits.length > 0 && (
                <ul className="divide-y divide-gray-100 border border-gray-100 rounded">
                  {hits.map(h => (
                    <li key={h.placeId} className="flex items-center justify-between gap-2 p-2">
                      <div className="text-sm"><p className="font-medium">{h.name}</p><p className="text-gray-500">{h.address}</p></div>
                      <button type="button" disabled={busy} onClick={() => save(h.placeId)} className="text-sm px-3 py-1.5 rounded-md border border-primary-500 text-primary-500">This is us</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
