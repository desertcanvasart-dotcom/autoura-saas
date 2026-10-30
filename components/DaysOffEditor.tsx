'use client'

import { useEffect, useState } from 'react'
import { CalendarX } from 'lucide-react'
import type { DayOff } from '@/lib/supplier-days-off'

// Days a supplier cannot work (migration 449). On the supplier's own page
// (who = 'supplier': they remove only days they marked) and on the supplier
// card (who = 'office': any day). A warning when choosing who covers a line —
// never a block.

export default function DaysOffEditor({
  url,
  who,
  initial,
  canEdit = true,
}: {
  /** GET (office only) / POST / DELETE endpoint. */
  url: string
  who: 'supplier' | 'office'
  /** Server-rendered days (the supplier page); the office loads them. */
  initial?: DayOff[]
  canEdit?: boolean
}) {
  const [days, setDays] = useState<DayOff[]>(initial ?? [])
  const [day, setDay] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initial) return
    let live = true
    fetch(url).then(r => r.json()).then(d => { if (live && d.success) setDays(d.data) }).catch(() => {})
    return () => { live = false }
  }, [url, initial])

  const call = async (method: 'POST' | 'DELETE', body: Record<string, unknown>) => {
    setBusy(true); setError(null)
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.success) { setError(d.error || 'Could not save — please try again'); return false }
      return true
    } finally { setBusy(false) }
  }

  const add = async () => {
    if (!day) return
    if (await call('POST', { day, note })) {
      setDays(prev => [...prev.filter(d => d.day !== day), { day, note: note.trim() || null, marked_by: who }].sort((a, b) => a.day.localeCompare(b.day)))
      setDay(''); setNote('')
    }
  }
  const remove = async (d: string) => {
    if (await call('DELETE', { day: d })) setDays(prev => prev.filter(x => x.day !== d))
  }

  const label = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const today = new Date().toISOString().slice(0, 10)
  const big = who === 'supplier'

  return (
    <div className="space-y-2">
      {days.length === 0
        ? <p className="text-sm text-gray-500">{big ? 'No days off marked.' : 'No days off marked.'}</p>
        : (
          <ul className="space-y-1">
            {days.map(d => (
              <li key={d.day} className={`flex items-center justify-between gap-2 ${big ? 'bg-white rounded-lg border border-gray-200 px-3 py-2 text-sm' : 'text-xs'}`}>
                <span className="text-gray-800">
                  <CalendarX className="inline w-3.5 h-3.5 mr-1 text-amber-600" />{label(d.day)}{d.note ? ` — ${d.note}` : ''}
                  {d.marked_by !== who && <span className="text-gray-400"> ({d.marked_by === 'office' ? 'marked by the agency' : 'marked by the supplier'})</span>}
                </span>
                {canEdit && (who === 'office' || d.marked_by === 'supplier') && (
                  <button type="button" disabled={busy} onClick={() => remove(d.day)} className="text-red-700 hover:underline disabled:opacity-50">Remove</button>
                )}
              </li>
            ))}
          </ul>
        )}
      {canEdit && (
        <div className={`flex flex-wrap items-end gap-2 ${big ? 'text-sm' : 'text-xs'}`}>
          <label className="text-gray-600">Day
            <input type="date" min={today} value={day} onChange={e => setDay(e.target.value)} className={big ? 'mt-1 block' : '!py-1 !text-xs mt-0.5 block'} />
          </label>
          <label className="text-gray-600 flex-1 min-w-[8rem]">Note (optional)
            <input value={note} onChange={e => setNote(e.target.value)} maxLength={200} className={big ? 'mt-1 block w-full' : '!py-1 !text-xs mt-0.5 block w-full'} />
          </label>
          <button type="button" disabled={busy || !day} onClick={add} className={`rounded-lg bg-gray-900 text-white font-medium disabled:opacity-50 ${big ? 'px-4 py-2.5' : 'px-2.5 py-1'}`}>
            Mark day off
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
