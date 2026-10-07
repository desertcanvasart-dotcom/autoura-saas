'use client'

// Cancel a trip from its itinerary page: a reason, and — when the trip has a
// booking — the booking cancelled with it (PUT /api/bookings/[id], managers
// and above; it records the cancellation date). The booking goes first, so a
// refused booking change leaves the itinerary as it was rather than half
// cancelled. Money already received is not touched: refunds are recorded on
// the invoice, as before.

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

export default function CancelTripDialog({ itineraryId, tripName, booking, paid, currency, onClose, onCancelled }: {
  itineraryId: string
  tripName: string
  booking: { id: string; booking_number: string } | null
  /** What the client has paid, to say so before cancelling. */
  paid: number | null
  currency: string
  onClose: () => void
  onCancelled: (reason: string | null) => void
}) {
  const [reason, setReason] = useState('')
  const [withBooking, setWithBooking] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setSaving(true)
    setError(null)
    const why = reason.trim() || null
    try {
      if (booking && withBooking) {
        const res = await fetch(`/api/bookings/${booking.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'cancelled', cancellation_reason: why }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || data.success === false) {
          throw new Error(res.status === 403
            ? `Only a manager can cancel booking ${booking.booking_number}. Nothing was changed.`
            : data.error || `Could not cancel booking ${booking.booking_number}. Nothing was changed.`)
        }
      }
      const res = await fetch(`/api/itineraries/${itineraryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', cancellation_reason: why }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not cancel the itinerary')
      onCancelled(why)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel the trip')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-trip-title">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
        <div>
          <h2 id="cancel-trip-title" className="text-base font-semibold text-gray-900">Cancel this trip?</h2>
          <p className="text-sm text-gray-600 mt-1">{tripName} will be marked cancelled. Its days, services and history stay as they are.</p>
        </div>

        <label className="block text-sm text-gray-700">
          Reason <span className="text-gray-400">(optional)</span>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" placeholder="e.g. Client postponed to next year" />
        </label>

        {booking && (
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={withBooking} onChange={e => setWithBooking(e.target.checked)} className="mt-0.5" />
            <span>Also cancel booking <span className="font-medium">{booking.booking_number}</span></span>
          </label>
        )}

        {paid != null && paid > 0.005 && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            {currency} {paid.toFixed(2)} has been paid on this trip. Cancelling does not refund it — record any refund on the invoice.
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md">Keep the trip</button>
          <button type="button" onClick={submit} disabled={saving} className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Cancel trip
          </button>
        </div>
      </div>
    </div>
  )
}
