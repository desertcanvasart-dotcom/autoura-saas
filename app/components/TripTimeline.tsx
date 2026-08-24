'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, MapPin, Radio } from 'lucide-react'

// ============================================
// TRIP TIMELINE — the office view of trip_events
// ============================================
// The same checkpoint log the traveller sees on the share page, but the
// office side: internal notes and actor names are VISIBLE here (that is what
// they are for), events poll while the page is open, and the office can log
// entries itself — including the 'note' kind that never reaches the customer.

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
// Office quick-log: the operational kinds plus the internal note.
const LOGGABLE = ['note', 'delayed', 'arrived', 'picked_up', 'dropped_off', 'completed']

export default function TripTimeline({ itineraryId }: { itineraryId: string }) {
  const [events, setEvents] = useState<TripEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [logKind, setLogKind] = useState<string>('note')
  const [logNote, setLogNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const logEvent = async () => {
    if (saving) return
    if (logKind === 'note' && !logNote.trim()) {
      setError('A note needs text')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/trip-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itinerary_id: itineraryId,
          event_kind: logKind,
          note: logNote.trim() || null,
          actor_name: 'Office',
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to log')
      setLogNote('')
      setLogKind('note')
      await fetchEvents()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log')
    } finally {
      setSaving(false)
    }
  }

  const fmt = (iso: string) => {
    try {
      const d = new Date(iso)
      const today = new Date().toDateString() === d.toDateString()
      return today
        ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    } catch { return iso }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Radio className="w-4 h-4 text-gray-500" />
          Trip timeline
        </h3>
        <span className="text-xs text-gray-400">{events.length > 0 && `${events.length} event${events.length === 1 ? '' : 's'} · `}updates every 30s</span>
      </div>

      {/* Quick log */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {LOGGABLE.map(k => (
          <button
            key={k}
            onClick={() => setLogKind(k)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              logKind === k
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
            }`}
          >
            {KIND_META[k].label}
          </button>
        ))}
        <input
          value={logNote}
          onChange={e => setLogNote(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') logEvent() }}
          placeholder={logKind === 'note' ? 'Internal note (never shown to the client)…' : 'Optional internal detail…'}
          className="flex-1 min-w-[180px] px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
        <button
          onClick={logEvent}
          disabled={saving}
          className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 flex items-center gap-1.5"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Log
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {/* Timeline */}
      {loading ? (
        <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">
          No checkpoints yet. Copy a staff link from an assignment above and send it to the guide or driver — their taps land here and on the client&apos;s live page.
        </p>
      ) : (
        <ol className="divide-y divide-gray-100">
          {events.map(e => {
            const meta = KIND_META[e.event_kind] ?? { label: e.event_kind, dot: 'bg-gray-400' }
            return (
              <li key={e.id} className="py-2.5 flex items-start gap-3">
                <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${meta.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{meta.label}</span>
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
                  <span>{fmt(e.occurred_at)}</span>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
