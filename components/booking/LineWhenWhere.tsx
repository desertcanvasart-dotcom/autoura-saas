'use client'

import { useState } from 'react'
import { Clock } from 'lucide-react'

// The office sets a line's time, pickup and drop-off. They go into the
// supplier's request, the voucher and the client's day message (none of
// which can say "09:30 at Mena House" until someone types it here).

export default function LineWhenWhere({
  bookingId,
  line,
  onSaved,
  notify,
}: {
  bookingId: string
  line: { id: string; service_time: string | null; pickup_location: string | null; dropoff_location: string | null }
  onSaved: () => void
  notify: (type: 'success' | 'error' | 'info', message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [time, setTime] = useState(line.service_time?.slice(0, 5) ?? '')
  const [pickup, setPickup] = useState(line.pickup_location ?? '')
  const [dropoff, setDropoff] = useState(line.dropoff_location ?? '')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: line.id, service_time: time, pickup_location: pickup, dropoff_location: dropoff }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) { notify('error', data.error || 'Could not save'); return }
      notify('success', 'Saved')
      setOpen(false)
      onSaved()
    } finally { setBusy(false) }
  }

  const has = line.service_time || line.pickup_location || line.dropoff_location
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-gray-600 hover:underline">
        <Clock className="w-3.5 h-3.5" /> {has ? 'Time & pickup' : 'Add time & pickup'}
      </button>
    )
  }
  return (
    <div className="w-full mt-1 rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-1.5 text-xs">
      <div className="flex flex-wrap gap-2">
        <label className="text-gray-600">Time
          <input type="time" value={time} onChange={e => setTime(e.target.value)} className="!py-1 !text-xs block" />
        </label>
        <label className="text-gray-600 flex-1 min-w-[9rem]">Pickup
          <input value={pickup} onChange={e => setPickup(e.target.value)} maxLength={255} className="!py-1 !text-xs block w-full" />
        </label>
        <label className="text-gray-600 flex-1 min-w-[9rem]">Drop-off
          <input value={dropoff} onChange={e => setDropoff(e.target.value)} maxLength={255} className="!py-1 !text-xs block w-full" />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="px-2 py-1 text-gray-600">Cancel</button>
        <button type="button" disabled={busy} onClick={save} className="px-2.5 py-1 rounded-md bg-blue-600 text-white font-medium disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  )
}
