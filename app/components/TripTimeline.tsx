'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MapPin, Radio, Undo2 } from 'lucide-react'

// ============================================
// TRIP TIMELINE — the office view of trip_events (the live log)
// ============================================
// The same checkpoint log the traveller sees on the share page, but the
// office side: internal notes and actor names are VISIBLE here (that is what
// they are for), events poll while the page is open, and the office can log
// entries itself — including the 'note' kind that never reaches the customer.
//
// Quick-tap: one tap logs a checkpoint. trip_events is append-only (no edit,
// no delete — corrections are new events), so a tap waits a few seconds with
// Undo before it is sent; a mis-tap never reaches the log or the client.
//
// Before the trip, with nothing logged, it is one line: there is nothing to
// read yet, and the Operations tab has more pressing things above it.

interface TripEvent {
  id: string
  itinerary_resource_id: string | null
  event_kind: string
  occurred_at: string
  lat: number | null
  lng: number | null
  note: string | null
  actor_name: string | null
  created_at: string
}

export interface TimelinePerson {
  /** itinerary_resources.id — the assignment the checkpoint is for. */
  id: string
  label: string
}

const KIND_META: Record<string, { label: string; dot: string }> = {
  departed:    { label: 'Departed',     dot: 'bg-blue-500' },
  en_route:    { label: 'En route',     dot: 'bg-blue-500' },
  arrived:     { label: 'Arrived',      dot: 'bg-green-500' },
  picked_up:   { label: 'Picked up',    dot: 'bg-green-500' },
  dropped_off: { label: 'Dropped off',  dot: 'bg-green-500' },
  checked_in:  { label: 'Checked in',   dot: 'bg-indigo-500' },
  checked_out: { label: 'Checked out',  dot: 'bg-indigo-500' },
  completed:   { label: 'Completed',    dot: 'bg-emerald-600' },
  delayed:     { label: 'Running late', dot: 'bg-amber-500' },
  note:        { label: 'Note',         dot: 'bg-gray-400' },
}
/** One-tap checkpoints the office logs most. */
const QUICK = ['picked_up', 'arrived', 'dropped_off', 'delayed', 'completed']
/** How long a tap waits for Undo before it is sent. */
const UNDO_MS = 5000

const dayOf = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

export default function TripTimeline({ itineraryId, startDate, endDate, today, people = [] }: {
  itineraryId: string
  /** With the dates, entries group under "Day N", and the empty log folds to one line before the trip. */
  startDate?: string | null
  endDate?: string | null
  /** YYYY-MM-DD, the agency's today. */
  today?: string
  /** The trip's assignments, so a checkpoint can say whose it is. */
  people?: TimelinePerson[]
}) {
  const [events, setEvents] = useState<TripEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [who, setWho] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ kind: string; note: string | null; who: string } | null>(null)
  const [expanded, setExpanded] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/trip-events?itinerary_id=${itineraryId}`)
      const data = await res.json()
      if (res.ok && data.success) setEvents(data.events)
    } catch {
      // Polling — a failed cycle just waits for the next one.
    } finally {
      setLoading(false)
    }
  }, [itineraryId])

  // Poll while the page is open: taps arrive from the road, not from this tab.
  useEffect(() => {
    fetchEvents()
    const t = setInterval(fetchEvents, 30000)
    return () => clearInterval(t)
  }, [fetchEvents])

  const send = useCallback(async (entry: { kind: string; note: string | null; who: string }) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/trip-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itinerary_id: itineraryId,
          event_kind: entry.kind,
          note: entry.note,
          itinerary_resource_id: entry.who || null,
          actor_name: 'Office',
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to log')
      await fetchEvents()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log')
    } finally {
      setSaving(false)
    }
  }, [itineraryId, fetchEvents])

  // A tapped checkpoint waits UNDO_MS, then goes; a new tap sends the waiting one first.
  const tap = (kind: string) => {
    if (timer.current) { clearTimeout(timer.current); if (pending) send(pending) }
    const entry = { kind, note: note.trim() || null, who }
    setPending(entry)
    setNote('')
    timer.current = setTimeout(() => { timer.current = null; setPending(null); send(entry) }, UNDO_MS)
  }
  const undo = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (pending?.note) setNote(pending.note)
    setPending(null)
  }
  // Leaving the page sends what is waiting rather than losing it.
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  useEffect(() => () => {
    if (timer.current && pendingRef.current) { clearTimeout(timer.current); send(pendingRef.current) }
  }, [send])

  const addNote = async () => {
    if (!note.trim()) { setError('A note needs text'); return }
    const text = note.trim()
    setNote('')
    await send({ kind: 'note', note: text, who })
  }

  const fmtTime = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) } catch { return iso }
  }

  const start = startDate ? String(startDate).slice(0, 10) : null
  const end = endDate ? String(endDate).slice(0, 10) : null
  const before = !!start && !!today && today < start
  const personLabel = (id: string | null) => (id ? people.find(p => p.id === id)?.label ?? null : null)

  // Grouped by trip day (newest first), when the dates are known.
  const groups: { key: string; title: string; items: TripEvent[] }[] = []
  for (const e of events) {
    const d = dayOf(e.occurred_at)
    const n = start ? daysBetween(start, d) + 1 : null
    const title = n == null
      ? new Date(e.occurred_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : n < 1 ? 'Before the trip'
      : end && d > end ? 'After the trip'
      : `Day ${n} · ${new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    const last = groups[groups.length - 1]
    if (last && last.title === title) last.items.push(e)
    else groups.push({ key: `${title}-${e.id}`, title, items: [e] })
  }

  // Folded: before the trip, nothing logged.
  if (!loading && events.length === 0 && before && !expanded && !pending) {
    const inDays = daysBetween(today!, start!)
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600 flex items-center gap-2">
          <Radio className="w-4 h-4 text-gray-400" />
          <span className="font-medium text-gray-900">Live log</span>
          <span className="text-gray-500">· nothing yet — the trip starts {inDays === 1 ? 'tomorrow' : `in ${inDays} days`}</span>
        </p>
        <button type="button" onClick={() => setExpanded(true)} className="text-xs font-medium text-primary-600 hover:underline">Open</button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Radio className="w-4 h-4 text-gray-500" />
          Live log
        </h3>
        <span className="text-xs text-gray-400">{events.length > 0 && `${events.length} entr${events.length === 1 ? 'y' : 'ies'} · `}updates every 30s</span>
      </div>

      {/* Quick-tap checkpoints, with an optional detail and whose it is. */}
      <div className="space-y-2 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          {people.length > 0 && (
            <select value={who} onChange={e => setWho(e.target.value)} className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white" aria-label="Whose checkpoint">
              <option value="">Whole trip</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          )}
          {QUICK.map(k => (
            <button
              key={k}
              type="button"
              onClick={() => tap(k)}
              className="px-2.5 py-1 rounded-full text-xs font-medium border border-gray-300 bg-white text-gray-700 hover:border-gray-500 hover:bg-gray-50"
              title={`Log "${KIND_META[k].label}" now (shown on the traveller's live page)`}
            >
              {KIND_META[k].label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addNote() }}
            placeholder="Internal note — never shown to the client (or a detail for the next checkpoint)"
            className="flex-1 min-w-[200px] px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
          <button
            type="button"
            onClick={addNote}
            disabled={saving}
            className="px-3 py-1.5 border border-gray-300 bg-white text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && !pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Add note
          </button>
        </div>
        <p className="text-[11px] text-gray-400">Checkpoints appear on the traveller&apos;s live page; notes stay internal.</p>
      </div>

      {pending && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <span>
            Logging <span className="font-medium">{KIND_META[pending.kind]?.label ?? pending.kind}</span>
            {personLabel(pending.who) && <> for {personLabel(pending.who)}</>}
            {pending.note && <> — {pending.note}</>}…
          </span>
          <button type="button" onClick={undo} className="flex items-center gap-1 text-xs font-medium underline hover:no-underline">
            <Undo2 className="w-3.5 h-3.5" /> Undo
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {/* Timeline */}
      {loading ? (
        <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">
          No checkpoints yet. Send each guide or driver their staff link (Send brief, above) — their taps land here and on the client&apos;s live page.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <div key={g.key}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{g.title}</p>
              <ol className="divide-y divide-gray-100">
                {g.items.map(e => {
                  const meta = KIND_META[e.event_kind] ?? { label: e.event_kind, dot: 'bg-gray-400' }
                  const person = personLabel(e.itinerary_resource_id)
                  return (
                    <li key={e.id} className="py-2 flex items-start gap-3">
                      <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${meta.dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900">
                          <span className="font-medium">{meta.label}</span>
                          {person && <span className="text-gray-700"> · {person}</span>}
                          {e.actor_name && <span className="text-gray-500"> — {e.actor_name}</span>}
                        </p>
                        {e.note && (
                          <p className="text-xs text-gray-500 mt-0.5 bg-gray-50 border border-gray-100 rounded px-2 py-1 inline-block">
                            🔒 {e.note}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-2 text-xs text-gray-500">
                        {e.lat !== null && e.lng !== null && (
                          <a
                            href={`https://www.google.com/maps?q=${e.lat},${e.lng}`}
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-0.5 underline"
                          >
                            <MapPin className="w-3 h-3" /> map
                          </a>
                        )}
                        <span>{fmtTime(e.occurred_at)}</span>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
