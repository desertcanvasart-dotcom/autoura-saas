'use client'

// ============================================
// Settings → Zones
// ============================================
// The parts of a city that change a transfer's price: Cairo's 6th of October,
// Luxor's West Bank, Aswan south of the bridge. Each city has its own list and
// one DEFAULT zone — where a hotel or transport card with no zone belongs.
// Migration 469, docs/transport-zones/PLAN.md step 1. Hotels (step 2) and
// transport cards (step 3) will pick from these lists.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Loader2, MapPin, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { useDestinationCities } from '@/hooks/useDestinationCities'
import { ZONE_WRITE_DENIED, cityMatch, groupZonesByCity, type CityZone } from '@/lib/rates/city-zones'

interface Notice { kind: 'success' | 'error'; text: string }

const inputCls = 'px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent'
const smallBtn = 'px-2.5 py-1.5 text-xs text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1 disabled:opacity-40'

export default function ZonesPage() {
  const dialog = useConfirmDialog()
  const { cities } = useDestinationCities()
  const [zones, setZones] = useState<CityZone[]>([])
  const [canWrite, setCanWrite] = useState(false)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [newCity, setNewCity] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null)
  const noticeRef = useRef<HTMLDivElement>(null)

  const say = useCallback((n: Notice) => {
    setNotice(n)
    requestAnimationFrame(() => noticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/zones')
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) { setState('failed'); return }
      setZones(json.data.zones)
      setCanWrite(Boolean(json.data.canWrite))
      setState('ready')
    } catch {
      setState('failed')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const send = async (key: string, url: string, method: string, body: unknown, done: string) => {
    setBusy(key)
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) { say({ kind: 'error', text: json?.error || 'That did not save. Try again.' }); return false }
      say({ kind: 'success', text: done })
      await load()
      return true
    } catch {
      say({ kind: 'error', text: 'The request did not reach the server. Check your connection and try again.' })
      return false
    } finally {
      setBusy(null)
    }
  }

  const groups = useMemo(() => groupZonesByCity(zones), [zones])
  const cityHasZones = (city: string) => zones.some(z => cityMatch(z.city) === cityMatch(city))

  const add = async () => {
    if (busy === 'new') return
    const label = newLabel
    const first = !cityHasZones(newCity)
    // Clear the box at once: typing the next name while this one saves must
    // start a fresh name, not run on into this one (found click-testing).
    setNewLabel('')
    const ok = await send('new', '/api/settings/zones', 'POST', { city: newCity, label },
      first ? `Added "${label.trim()}" — ${newCity}'s first zone, so it is the default.` : `Added "${label.trim()}" to ${newCity}.`)
    if (!ok) setNewLabel(current => current || label)
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-4xl space-y-6">
      <p className="text-xs text-gray-500 max-w-3xl">
        A transfer or day tour can cost more depending on where in the city the hotel is. List each city&apos;s areas here.
        Each city has one <strong>default</strong> zone: a hotel or transport card with no zone counts as the default.
        Each hotel takes its area under Rates → Hotels (required once its city has zones), and each transport card its
        pickup area under Rates → Transportation. Until pricing reads them, a card in a non-default area is not used.
      </p>

      {state === 'ready' && !canWrite && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {ZONE_WRITE_DENIED}
        </div>
      )}

      {notice && (
        <div ref={noticeRef} role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`p-3 rounded-lg text-sm flex items-start gap-2 ${notice.kind === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {notice.kind === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {state === 'loading' && <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading your zones…</div>}
      {state === 'failed' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          This page could not load. <button onClick={() => { setState('loading'); load() }} className="underline">Try again</button>
        </div>
      )}

      {state === 'ready' && (
        <>
          {canWrite && (
            <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">Add a zone</h2>
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-3">
                <select value={newCity} onChange={e => setNewCity(e.target.value)} aria-label="City" className={inputCls}>
                  <option value="">City…</option>
                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input value={newLabel} onChange={e => setNewLabel(e.target.value)} aria-label="Zone name"
                  onKeyDown={e => { if (e.key === 'Enter' && newCity && newLabel.trim() && busy !== 'new') add() }}
                  placeholder="Zone name, for example West Bank" className={inputCls} />
                <button disabled={!newCity || !newLabel.trim() || busy === 'new'} onClick={add}
                  className="px-3 py-2 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-[#566b3d] disabled:bg-gray-200 disabled:text-gray-500 inline-flex items-center gap-1.5 justify-center">
                  {busy === 'new' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add zone
                </button>
              </div>
              {newCity && !cityHasZones(newCity) && (
                <p className="text-xs text-gray-500">The first zone you add to {newCity} becomes its default. Usually that&apos;s the main city area, for example &quot;{newCity}&quot; itself.</p>
              )}
            </section>
          )}

          {groups.length === 0 ? (
            <p className="text-sm text-gray-600 bg-white border border-gray-200 rounded-lg p-4">
              No zones yet. A city with no zones is priced as one place, as it is today.
            </p>
          ) : groups.map(g => {
            const others = g.zones.filter(z => !z.is_default)
            return (
              <section key={g.city} className="bg-white border border-gray-200 rounded-lg">
                <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-900">{g.city}</h2>
                  <span className="text-xs text-gray-500">{g.zones.length} zone{g.zones.length === 1 ? '' : 's'}</span>
                </div>
                <ul className="divide-y divide-gray-100">
                  {g.zones.map(z => {
                    const isEditing = editing?.id === z.id
                    const pos = others.findIndex(o => o.id === z.id)
                    return (
                      <li key={z.id} className="p-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                        {isEditing && editing ? (
                          <>
                            <input value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })} aria-label="Zone name" className={`${inputCls} flex-1 min-w-[12rem]`} autoFocus />
                            <button disabled={!editing.label.trim() || busy === z.id}
                              onClick={async () => { if (await send(z.id, `/api/settings/zones/${z.id}`, 'PATCH', { label: editing.label }, `Renamed to "${editing.label.trim()}".`)) setEditing(null) }}
                              className="px-3 py-2 text-sm font-medium text-white bg-primary-500 rounded-lg disabled:bg-gray-200 disabled:text-gray-500">Save</button>
                            <button onClick={() => setEditing(null)} className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg">Cancel</button>
                          </>
                        ) : (
                          <>
                            <p className="flex-1 min-w-0 text-sm text-gray-900 break-words">
                              {z.label}
                              {z.is_default && <span className="ml-2 text-xs font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded px-1.5 py-0.5">Default</span>}
                            </p>
                            {canWrite && (
                              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                {!z.is_default && (
                                  <>
                                    <button className={smallBtn} aria-label={`Move ${z.label} up`} disabled={pos <= 0 || busy === z.id}
                                      onClick={() => send(z.id, `/api/settings/zones/${z.id}`, 'PATCH', { move: 'up' }, `Moved "${z.label}" up.`)}><ArrowUp className="w-3.5 h-3.5" /></button>
                                    <button className={smallBtn} aria-label={`Move ${z.label} down`} disabled={pos === others.length - 1 || busy === z.id}
                                      onClick={() => send(z.id, `/api/settings/zones/${z.id}`, 'PATCH', { move: 'down' }, `Moved "${z.label}" down.`)}><ArrowDown className="w-3.5 h-3.5" /></button>
                                    <button className={smallBtn} disabled={busy === z.id}
                                      onClick={() => send(z.id, `/api/settings/zones/${z.id}`, 'PATCH', { is_default: true }, `"${z.label}" is now ${g.city}'s default zone.`)}><Star className="w-3.5 h-3.5" /> Make default</button>
                                  </>
                                )}
                                <button className={smallBtn} onClick={() => setEditing({ id: z.id, label: z.label })}><Pencil className="w-3.5 h-3.5" /> Rename</button>
                                <button disabled={busy === z.id}
                                  onClick={async () => {
                                    const yes = await dialog.confirmDelete(`“${z.label}”`, `Delete the ${g.city} zone “${z.label}”?`)
                                    if (yes) send(z.id, `/api/settings/zones/${z.id}`, 'DELETE', undefined, `“${z.label}” deleted.`)
                                  }}
                                  className="px-2.5 py-1.5 text-xs text-red-700 border border-red-200 rounded-lg hover:bg-red-50 inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                              </div>
                            )}
                          </>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
