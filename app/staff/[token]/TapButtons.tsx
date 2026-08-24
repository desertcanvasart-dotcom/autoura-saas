'use client'

import { useState } from 'react'
import type { StaffEventKind } from '@/lib/staff-link'

// The whole point of the execution layer, reduced to its physical form: big
// buttons a driver can hit one-handed in a parking lane. Geolocation is
// requested AT TAP TIME only and the tap never waits long for it — a
// checkpoint with no pin beats a driver staring at a spinner.

const BUTTONS: Array<{ kind: StaffEventKind; label: string; emoji: string }> = [
  { kind: 'departed', label: 'Departed', emoji: '🚗' },
  { kind: 'en_route', label: 'En route', emoji: '🛣️' },
  { kind: 'arrived', label: 'Arrived', emoji: '📍' },
  { kind: 'picked_up', label: 'Picked up', emoji: '🤝' },
  { kind: 'dropped_off', label: 'Dropped off', emoji: '🏁' },
  { kind: 'checked_in', label: 'Checked in', emoji: '🏨' },
  { kind: 'checked_out', label: 'Checked out', emoji: '🧳' },
  { kind: 'delayed', label: 'Running late', emoji: '⏳' },
  { kind: 'completed', label: 'Completed', emoji: '✅' },
]
const LABEL = Object.fromEntries(BUTTONS.map(b => [b.kind, b.label])) as Record<StaffEventKind, string>

function tapTimePosition(timeoutMs = 4000): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
    const timer = setTimeout(() => resolve(null), timeoutMs)
    navigator.geolocation.getCurrentPosition(
      pos => { clearTimeout(timer); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }) },
      () => { clearTimeout(timer); resolve(null) },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 }
    )
  })
}

export default function TapButtons({
  token,
  initialEvents,
}: {
  token: string
  initialEvents: Array<{ kind: StaffEventKind; occurredAt: string }>
}) {
  const [events, setEvents] = useState(initialEvents)
  const [busy, setBusy] = useState<StaffEventKind | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tap = async (kind: StaffEventKind) => {
    if (busy) return
    setBusy(kind)
    setError(null)
    try {
      const pos = await tapTimePosition()
      const res = await fetch(`/api/staff/${token}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_kind: kind, lat: pos?.lat ?? null, lng: pos?.lng ?? null }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
      setEvents(prev => [{ kind, occurredAt: data.event.occurred_at }, ...prev])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record — try again')
    } finally {
      setBusy(null)
    }
  }

  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    } catch { return iso }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {BUTTONS.map(b => (
          <button
            key={b.kind}
            onClick={() => tap(b.kind)}
            disabled={busy !== null}
            className="bg-white border border-gray-200 rounded-2xl shadow-sm py-5 px-3 text-center active:scale-95 transition-transform disabled:opacity-40"
          >
            <span className="block text-3xl mb-1">{busy === b.kind ? '⏺' : b.emoji}</span>
            <span className="block text-sm font-semibold text-gray-900">{b.label}</span>
          </button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-red-600 text-center">{error}</p>}

      {events.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Logged</h2>
          <ol className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {events.map((e, i) => (
              <li key={i} className="px-4 py-2.5 flex items-center justify-between text-sm">
                <span className="text-gray-900">{LABEL[e.kind] ?? e.kind}</span>
                <span className="text-gray-500 text-xs">{fmtTime(e.occurredAt)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      <p className="mt-6 text-xs text-gray-400 text-center">
        Each tap is shared with your office and the traveller live page.
      </p>
    </div>
  )
}
