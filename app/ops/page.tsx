'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronDown, ChevronUp, MessageCircle, Radio } from 'lucide-react'
import TripTimeline from '@/app/components/TripTimeline'
import TravellerChat from '@/app/components/TravellerChat'
import PushToggle from './PushToggle'

// ============================================
// /ops — the phone-first ops board (PWA start_url)
// ============================================
// The coordinator's pocket view: every trip on the ground today, tap one to
// expand its full timeline — the same TripTimeline the itinerary page uses,
// quick-log bar included. Session-protected like the rest of the app; the
// PWA install just pins this page to the phone's home screen.

interface TodayTrip {
  id: string
  trip_name: string | null
  client_name: string | null
  start_date: string | null
  end_date: string | null
  latest_event: { event_kind: string; occurred_at: string; actor_name: string | null } | null
  unread_messages: number
}

const KIND_LABEL: Record<string, string> = {
  departed: 'Departed', en_route: 'En route', arrived: 'Arrived',
  picked_up: 'Picked up', dropped_off: 'Dropped off',
  checked_in: 'Checked in', checked_out: 'Checked out',
  completed: 'Completed', delayed: 'Running late', note: 'Note',
}

export default function OpsPage() {
  const [trips, setTrips] = useState<TodayTrip[] | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/trip-events/today')
      const data = await res.json()
      if (res.ok && data.success) setTrips(data.trips)
      else setTrips(prev => prev ?? [])
    } catch {
      setTrips(prev => prev ?? [])
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  const toggle = (id: string) =>
    setOpen(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    } catch { return iso }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-white" title="Back to dashboard">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <Radio className="w-5 h-5 text-green-400" />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Today on the ground</h1>
            <p className="text-xs text-gray-400">
              {trips === null ? 'Loading…' : `${trips.length} active trip${trips.length === 1 ? '' : 's'} · updates every 30s`}
            </p>
          </div>
          <div className="ml-auto">
            <PushToggle />
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-3 py-4 space-y-3">
        {trips !== null && trips.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 text-sm text-gray-500">
            <p>No trips on the ground today.</p>
            <p className="mt-2 text-xs text-gray-400">
              Trips appear here when an itinerary&apos;s dates include today. Assign a guide
              or driver, copy their staff link from the itinerary page, and their taps
              show up live — here, on the trip timeline, and on the client&apos;s page.
            </p>
          </div>
        )}

        {(trips ?? []).map(t => (
          <div key={t.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <button onClick={() => toggle(t.id)} className="w-full text-left px-4 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {t.trip_name || 'Trip'}
                  {t.client_name && <span className="font-normal text-gray-500"> · {t.client_name}</span>}
                </p>
                <p className="text-xs mt-0.5 text-gray-600">
                  {t.latest_event ? (
                    <>
                      <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${
                        t.latest_event.event_kind === 'delayed' ? 'bg-amber-500' : 'bg-green-500'
                      }`} />
                      {KIND_LABEL[t.latest_event.event_kind] ?? t.latest_event.event_kind}
                      {t.latest_event.actor_name && <> — {t.latest_event.actor_name}</>}
                      {' · '}{fmtTime(t.latest_event.occurred_at)}
                    </>
                  ) : (
                    <span className="text-gray-400">No checkpoints yet</span>
                  )}
                </p>
              </div>
              {t.unread_messages > 0 && (
                <span
                  className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-600 text-white text-xs font-semibold"
                  title="Unanswered traveller messages"
                >
                  <MessageCircle className="w-3 h-3" />
                  {t.unread_messages}
                </span>
              )}
              {open.has(t.id) ? (
                <ChevronUp className="w-4 h-4 shrink-0 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 shrink-0 text-gray-400" />
              )}
            </button>
            {open.has(t.id) && (
              <div className="border-t border-gray-100 p-1 space-y-1">
                <TripTimeline itineraryId={t.id} />
                {/* Same thread as the itinerary page and the traveller's share
                    page; opening it here marks their messages read. */}
                <TravellerChat itineraryId={t.id} />
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}
