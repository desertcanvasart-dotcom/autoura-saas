'use client'

import { useState } from 'react'
import { History, Loader2 } from 'lucide-react'
import { STATUS_LABEL, normalizeStatus } from '@/lib/bookings/service-booking-states'

// One service line's history: who did what and when — the office, the
// supplier through their link, or the deadline / done jobs. From
// /api/bookings/[id]/suppliers/[lineId]/history (newest first).

interface Event {
  id: string
  occurred_at: string
  actor_kind: 'operator' | 'supplier' | 'system'
  actor_label: string | null
  channel: string
  from_status: string | null
  to_status: string | null
  note: string | null
}

const WHO: Record<Event['actor_kind'], string> = { operator: 'Office', supplier: 'Supplier', system: 'Autoura' }
const BY: Record<string, string> = { link: 'by link', whatsapp: 'on WhatsApp', email: 'by email' }

export default function LineHistory({ bookingId, lineId }: { bookingId: string; lineId: string }) {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<Event[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggle = async () => {
    if (open) { setOpen(false); return }
    setOpen(true)
    setEvents(null)
    setError(null)
    const res = await fetch(`/api/bookings/${bookingId}/suppliers/${lineId}/history`)
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.success) setEvents(data.data)
    else setError(data.error || 'Could not load the history')
  }

  return (
    <div className="relative inline-block">
      <button type="button" onClick={toggle} className="inline-flex items-center gap-1 text-xs text-gray-600 hover:underline">
        <History className="w-3.5 h-3.5" /> History
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-80 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 shadow-lg text-left">
          {error ? (
            <p className="text-xs text-red-700">{error}</p>
          ) : !events ? (
            <p className="text-xs text-gray-500 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</p>
          ) : events.length === 0 ? (
            <p className="text-xs text-gray-500">Nothing recorded yet.</p>
          ) : (
            <ol className="space-y-2">
              {events.map(e => (
                <li key={e.id} className="text-xs">
                  <div className="text-gray-400">
                    {new Date(e.occurred_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {' · '}{e.actor_kind === 'system' ? WHO.system : (e.actor_label || WHO[e.actor_kind])}{BY[e.channel] ? ` ${BY[e.channel]}` : ''}
                  </div>
                  <div className="text-gray-800">
                    {e.to_status && e.from_status !== e.to_status && (
                      <span className="font-medium">
                        {e.from_status ? `${STATUS_LABEL[normalizeStatus(e.from_status)]} → ` : ''}{STATUS_LABEL[normalizeStatus(e.to_status)]}
                      </span>
                    )}
                    {e.note && <span className={e.to_status ? ' text-gray-600' : ''}>{e.to_status ? ` — ${e.note}` : e.note}</span>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
