'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { MapPin, Radio } from 'lucide-react'

// ============================================
// TODAY ON THE GROUND — the ops-board seed
// ============================================
// Every trip running today, each with its latest checkpoint. This is the
// cross-trip view: the per-trip timeline lives on the itinerary page; this
// card answers "is anything happening out there right now?" from the
// dashboard, without opening ten tabs.

interface TodayTrip {
  id: string
  trip_name: string | null
  client_name: string | null
  start_date: string | null
  end_date: string | null
  latest_event: {
    event_kind: string
    occurred_at: string
    actor_name: string | null
    lat: number | null
    lng: number | null
  } | null
}

const KIND_LABEL: Record<string, string> = {
  departed: 'Departed', en_route: 'En route', arrived: 'Arrived',
  picked_up: 'Picked up', dropped_off: 'Dropped off',
  checked_in: 'Checked in', checked_out: 'Checked out',
  completed: 'Completed', delayed: 'Running late', note: 'Note',
}

export default function TodayOnTheGround() {
  const [trips, setTrips] = useState<TodayTrip[] | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/trip-events/today')
      const data = await res.json()
      if (res.ok && data.success) setTrips(data.trips)
      else setTrips(prev => prev ?? [])   // first load failed: show empty, not spinner
    } catch {
      setTrips(prev => prev ?? [])
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  const fmtTime = (iso: string) => {
    try {
      const d = new Date(iso)
      const today = new Date().toDateString() === d.toDateString()
      return today
        ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    } catch { return iso }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Radio className="w-4 h-4 text-green-600" />
          Today on the ground
        </h3>
        {trips !== null && trips.length > 0 && (
          <span className="text-xs text-gray-400">{trips.length} active trip{trips.length === 1 ? '' : 's'}</span>
        )}
      </div>

      {trips === null ? (
        <p className="text-sm text-gray-400 py-3 text-center">Loading…</p>
      ) : trips.length === 0 ? (
        <div className="py-3 text-sm text-gray-500">
          <p>No trips on the ground today.</p>
          <p className="mt-1.5 text-xs text-gray-400">
            When an itinerary&apos;s dates include today, it appears here with its latest
            checkpoint — assign a guide or driver on the{' '}
            <Link href="/itineraries" className="underline">itinerary page</Link>, copy their
            staff link, and their taps show up live.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {trips.map(t => (
            <li key={t.id}>
              <Link
                href={`/itineraries/${t.id}`}
                className="flex items-center gap-3 py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {t.trip_name || 'Trip'}
                    {t.client_name && <span className="font-normal text-gray-500"> · {t.client_name}</span>}
                  </p>
                  <p className="text-xs mt-0.5">
                    {t.latest_event ? (
                      <span className="text-gray-600">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${
                          t.latest_event.event_kind === 'delayed' ? 'bg-amber-500' : 'bg-green-500'
                        }`} />
                        {KIND_LABEL[t.latest_event.event_kind] ?? t.latest_event.event_kind}
                        {t.latest_event.actor_name && <> — {t.latest_event.actor_name}</>}
                        {' · '}{fmtTime(t.latest_event.occurred_at)}
                      </span>
                    ) : (
                      <span className="text-gray-400">
                        <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle bg-gray-300" />
                        No checkpoints yet
                      </span>
                    )}
                  </p>
                </div>
                {t.latest_event?.lat != null && t.latest_event?.lng != null && (
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
