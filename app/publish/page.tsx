'use client'

// ============================================
// Publish — the company's website at a glance
// ============================================
// docs/publish/PLAN.md §15 (overview). The site, whether its pages are in
// step with the records (sync health), its domains, and its tour pages per
// language: published or not, approved text or not. Managers add a tour's
// page here; the page itself is reviewed and published on its own screen.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Globe, Plus, CheckCircle2, AlertTriangle, Clock, ExternalLink } from 'lucide-react'
import { useRole } from '@/hooks/useRole'
import { showToast } from '@/app/contexts/ToastContext'

interface Locale { id: string; language: string; slug: string; is_published: boolean; current_version_id: string | null }
interface PageRow { id: string; kind: string; tour_template_id: string | null; tour_templates: { template_name: string; is_active: boolean | null } | null; publish_page_locales: Locale[] }
interface Overview {
  site: null | { id: string; archetype: string; status: string; languages: string[]; companyName: string }
  health?: null | { status: string; last_success_at: string | null; last_error: string | null; lag_seconds: number }
  domains?: Array<{ hostname: string; kind: string; status: string }>
  pages?: PageRow[]
  toursWithoutPage?: Array<{ id: string; template_name: string }>
}

const ARCHETYPE: Record<string, string> = { private_journeys: 'Private journeys', transparent_value: 'Transparent value', modern: 'Modern' }
const HEALTH: Record<string, { label: string; tone: string }> = {
  ok: { label: 'In step with your records', tone: 'bg-green-50 text-green-700 border-green-200' },
  lagging: { label: 'Behind — changes are waiting', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  failing: { label: 'Not updating — we have been alerted', tone: 'bg-red-50 text-red-700 border-red-200' },
  stalled: { label: 'Stopped — we have been alerted', tone: 'bg-red-50 text-red-700 border-red-200' },
}

export default function PublishOverviewPage() {
  const { isAdmin, isManager } = useRole()
  const canManage = isAdmin || isManager
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/publish/overview')
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setData(json.data)
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Could not load the website')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  async function addPage() {
    if (!adding) return
    const res = await fetch('/api/publish/pages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tourTemplateId: adding }) })
    const json = await res.json()
    if (!json.success) return showToast('error', json.error)
    showToast('success', 'Page added — review it and publish when ready')
    setAdding('')
    load()
  }

  if (loading && !data) {
    return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]" /></div>
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[#647C47]/10 rounded-lg flex items-center justify-center"><Globe className="h-5 w-5 text-[#647C47]" /></div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Website</h1>
          <p className="text-sm text-gray-500">Your tour pages, built from your tours and rates — prices always as they are in Autoura</p>
        </div>
      </div>

      {!data?.site ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-600">
          Publish is not switched on for your company yet. Your account manager sets up the site with you (archetype, brand, domain).
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Site</p>
              <p className="mt-1 font-medium text-gray-900">{ARCHETYPE[data.site.archetype] ?? data.site.archetype}</p>
              <p className="text-sm text-gray-500">{data.site.status === 'live' ? 'Live' : data.site.status === 'draft' ? 'Not live yet' : 'Suspended'} · {data.site.languages.map(l => l.toUpperCase()).join(' + ')}</p>
              <Link href="/publish/look" className="mt-2 block text-sm text-[#647C47] hover:underline">Look and feel — theme, colours, fonts →</Link>
              <Link href="/publish/embed" className="mt-1 block text-sm text-[#647C47] hover:underline">On your own website — show your tours there →</Link>
              <Link href="/publish/domains" className="mt-1 block text-sm text-[#647C47] hover:underline">Your website&apos;s address — domain, going public →</Link>
              {canManage && <a href="/api/publish/export" className="mt-1 block text-sm text-[#647C47] hover:underline">Download the whole website (zip) ↓</a>}
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Sync with your records</p>
              {data.health ? (
                <span className={`inline-block mt-2 text-sm px-2 py-1 rounded border ${HEALTH[data.health.status]?.tone ?? ''}`}>{HEALTH[data.health.status]?.label ?? data.health.status}</span>
              ) : <p className="mt-1 text-sm text-gray-500">Not enrolled</p>}
              {data.health?.last_success_at && <p className="mt-2 text-xs text-gray-500">In step as of {new Date(data.health.last_success_at).toLocaleString()}</p>}
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Domains</p>
              {(data.domains ?? []).length === 0 ? <p className="mt-1 text-sm text-gray-500">None yet</p> : (
                <ul className="mt-1 space-y-1 text-sm">
                  {data.domains!.map(d => (
                    <li key={d.hostname} className="flex items-center gap-2">
                      <a href={`https://${d.hostname}`} target="_blank" rel="noreferrer" className="text-[#647C47] hover:underline inline-flex items-center gap-1">{d.hostname}<ExternalLink className="h-3 w-3" /></a>
                      <span className="text-xs text-gray-400">{d.kind === 'test' ? 'test' : d.status === 'active' ? 'live' : d.status.replace('_', ' ')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-200">
              <h2 className="font-medium text-gray-900">Tour pages</h2>
              {canManage && (data.toursWithoutPage ?? []).length > 0 && (
                <div className="flex items-center gap-2">
                  <select value={adding} onChange={e => setAdding(e.target.value)} className="text-sm border border-gray-300 rounded-md px-2 py-1.5 max-w-xs">
                    <option value="">Add a page for a tour…</option>
                    {data.toursWithoutPage!.map(t => <option key={t.id} value={t.id}>{t.template_name}</option>)}
                  </select>
                  <button onClick={addPage} disabled={!adding} className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md bg-[#647C47] text-white disabled:opacity-40">
                    <Plus className="h-4 w-4" />Add
                  </button>
                </div>
              )}
            </div>
            {(data.pages ?? []).filter(p => p.kind === 'tour').length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500">No tour pages yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-gray-400">
                  <tr><th className="px-4 py-2 font-medium">Tour</th>{data.site.languages.map(l => <th key={l} className="px-4 py-2 font-medium">{l.toUpperCase()}</th>)}</tr>
                </thead>
                <tbody>
                  {data.pages!.filter(p => p.kind === 'tour').map(p => (
                    <tr key={p.id} className="border-t border-gray-100">
                      <td className="px-4 py-2">
                        <Link href={`/publish/pages/${p.id}`} className="text-gray-900 hover:text-[#647C47] font-medium">{p.tour_templates?.template_name ?? 'A deleted tour'}</Link>
                        {p.tour_templates?.is_active === false && <span className="ml-2 text-xs text-amber-700">tour switched off</span>}
                      </td>
                      {data.site!.languages.map(l => {
                        const loc = p.publish_page_locales.find(x => x.language === l)
                        if (!loc) return <td key={l} className="px-4 py-2 text-gray-400">—</td>
                        return (
                          <td key={l} className="px-4 py-2">
                            <Link href={`/publish/pages/${p.id}?lang=${l}`} className="inline-flex items-center gap-1.5">
                              {loc.is_published
                                ? <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-4 w-4" />Published</span>
                                : <span className="inline-flex items-center gap-1 text-gray-500"><Clock className="h-4 w-4" />Not published</span>}
                              {!loc.current_version_id && <span className="inline-flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3 w-3" />no text yet</span>}
                            </Link>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
