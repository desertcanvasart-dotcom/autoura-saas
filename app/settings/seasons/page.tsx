'use client'

// ============================================
// Settings → Demand calendar (C3.1)
// ============================================
// The operator's own seasons — not the suppliers'. A hotel's high season is
// already inside its rate; this is the judgement that a date sells out and is
// worth more, applied to the selling price after margin.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarRange, Plus, Trash2, Loader2, AlertCircle, Check, X } from 'lucide-react'
import { useRole } from '@/hooks/useRole'

interface SeasonDate {
  id: string
  start_date: string
  end_date: string
  label: string | null
}
interface Season {
  id: string
  name: string
  uplift_percent: number
  colour: string
  is_active: boolean
  dates: SeasonDate[]
}

export default function SeasonsPage() {
  const { isAdmin } = useRole()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [available, setAvailable] = useState(true)

  const [newSeason, setNewSeason] = useState({ name: '', uplift_percent: '10' })
  const [dateForms, setDateForms] = useState<Record<string, { start: string; end: string; label: string }>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/pricing-seasons')
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setSeasons(data.seasons)
        setAvailable(true)
      } else {
        setAvailable(false)
      }
    } catch {
      setAvailable(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (key: string, payload: Record<string, unknown>, okText?: string) => {
    setBusy(key)
    setNotice(null)
    try {
      const res = await fetch('/api/pricing-seasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!data.success) {
        setNotice({ ok: false, text: data.error || 'Request failed' })
        return false
      }
      if (okText) setNotice({ ok: true, text: okText })
      await load()
      return true
    } catch {
      setNotice({ ok: false, text: 'Request failed' })
      return false
    } finally {
      setBusy(null)
    }
  }

  const addSeason = async () => {
    if (!newSeason.name.trim()) return
    const ok = await act('new-season', {
      action: 'create_season',
      name: newSeason.name,
      uplift_percent: Number(newSeason.uplift_percent) || 0,
    }, `${newSeason.name.trim()} added`)
    if (ok) setNewSeason({ name: '', uplift_percent: '10' })
  }

  const addDates = async (seasonId: string) => {
    const f = dateForms[seasonId]
    if (!f?.start || !f?.end) return
    const ok = await act(`dates-${seasonId}`, {
      action: 'add_dates',
      season_id: seasonId,
      start_date: f.start,
      end_date: f.end,
      label: f.label,
    }, 'Dates added')
    if (ok) setDateForms(prev => ({ ...prev, [seasonId]: { start: '', end: '', label: '' } }))
  }

  const q = searchTerm.trim().toLowerCase()
  const filtered = q ? seasons.filter(s => s.name.toLowerCase().includes(q)) : seasons

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-700">← Settings</Link>
        <div className="flex items-center gap-3 mt-2">
          <CalendarRange className="w-6 h-6 text-[#647C47]" />
          <h1 className="text-2xl font-semibold text-gray-900">Demand calendar</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Your own peak dates. A supplier&rsquo;s high season is already priced into their rate —
          this is the premium you decide to charge on top, applied to the selling price after
          your margin. A departure inside two overlapping seasons takes the higher premium.
        </p>
      </div>

      {notice && (
        <div className={`mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm ${
          notice.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {notice.ok ? <Check className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="ml-auto shrink-0 opacity-60 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {!isAdmin && !loading && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          Viewing only — an admin can change the demand calendar.
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading…
        </div>
      ) : !available ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
          The demand calendar is not available yet (database migration pending). Pricing
          runs without a premium until then.
        </div>
      ) : (
        <div className="space-y-3">
          {seasons.length === 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
              No seasons yet. Add one — for example &ldquo;New Year&rdquo; at +15% — then give it the
              dates it covers this year.
            </div>
          )}

          {seasons.length > 0 && (
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search seasons…"
              className="w-full md:w-80 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#647C47] focus:border-transparent"
            />
          )}

          {seasons.length > 0 && filtered.length === 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-400 text-center">
              No matches.
            </div>
          )}

          {filtered.map(s => (
            <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">
                    {s.name}
                    <span className="ml-2 text-sm text-[#4a5c35]">+{s.uplift_percent}%</span>
                    {!s.is_active && <span className="ml-2 text-xs text-gray-400">(off)</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {s.dates.length === 0
                      ? 'No dates yet — this season never applies until it has some.'
                      : `${s.dates.length} date range${s.dates.length === 1 ? '' : 's'}`}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => act(`toggle-${s.id}`, { action: 'update_season', id: s.id, is_active: !s.is_active }, s.is_active ? 'Season switched off' : 'Season switched on')}
                      disabled={busy !== null}
                      className="text-xs text-gray-500 hover:text-[#647C47] border border-gray-200 rounded px-2 py-0.5"
                    >
                      {s.is_active ? 'Switch off' : 'Switch on'}
                    </button>
                    <button
                      onClick={() => act(`del-${s.id}`, { action: 'delete_season', id: s.id }, `${s.name} removed`)}
                      disabled={busy !== null}
                      className="p-1 text-gray-400 hover:text-red-600"
                      title="Delete season and its dates"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {s.dates.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {s.dates.map(d => (
                    <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-gray-700">
                        {d.start_date} → {d.end_date}
                        {d.label && <span className="ml-2 text-xs text-gray-400">{d.label}</span>}
                      </span>
                      {isAdmin && (
                        <button
                          onClick={() => act(`deldate-${d.id}`, { action: 'delete_dates', id: d.id }, 'Dates removed')}
                          disabled={busy !== null}
                          className="text-xs text-gray-400 hover:text-red-600"
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {isAdmin && (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                    <input
                      type="date"
                      value={dateForms[s.id]?.start ?? ''}
                      onChange={e => setDateForms(p => ({ ...p, [s.id]: { ...(p[s.id] ?? { start: '', end: '', label: '' }), start: e.target.value } }))}
                      className="px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                    <input
                      type="date"
                      value={dateForms[s.id]?.end ?? ''}
                      onChange={e => setDateForms(p => ({ ...p, [s.id]: { ...(p[s.id] ?? { start: '', end: '', label: '' }), end: e.target.value } }))}
                      className="px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Label (optional)</label>
                    <input
                      value={dateForms[s.id]?.label ?? ''}
                      onChange={e => setDateForms(p => ({ ...p, [s.id]: { ...(p[s.id] ?? { start: '', end: '', label: '' }), label: e.target.value } }))}
                      placeholder="e.g. New Year 2026/27"
                      className="px-2 py-1.5 text-sm border border-gray-300 rounded-md w-44"
                    />
                  </div>
                  <button
                    onClick={() => addDates(s.id)}
                    disabled={busy !== null || !dateForms[s.id]?.start || !dateForms[s.id]?.end}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm text-white bg-[#647C47] rounded-md hover:bg-[#4f6238] disabled:opacity-50"
                  >
                    {busy === `dates-${s.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Add dates
                  </button>
                </div>
              )}
            </div>
          ))}

          {isAdmin && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">New season</label>
                <input
                  value={newSeason.name}
                  onChange={e => setNewSeason(s => ({ ...s, name: e.target.value }))}
                  placeholder="e.g. New Year"
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-md w-48"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Premium %</label>
                <input
                  type="number"
                  min={0}
                  max={200}
                  step="0.5"
                  value={newSeason.uplift_percent}
                  onChange={e => setNewSeason(s => ({ ...s, uplift_percent: e.target.value }))}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-md w-24"
                />
              </div>
              <button
                onClick={addSeason}
                disabled={busy !== null || !newSeason.name.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-50"
              >
                {busy === 'new-season' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add season
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
