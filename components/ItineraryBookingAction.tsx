'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BookOpen, Loader2 } from 'lucide-react'
import { createClient } from '@/app/supabase'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { showToast } from '@/app/contexts/ToastContext'

// The itinerary's booking step, in one place.
//
// Confirming an itinerary BOOKS it (PUT /api/itineraries/[id] creates the
// booking). Operators looked for a "Convert to Booking" button, found none,
// and missed the small booking tag — so the step is now a button:
//   booked               → "Go to Booking BK-…"
//   confirmed, no booking → "Create Booking"   (POST …/booking, same step)
//   draft / sent / …      → "Convert to Booking" = confirm, which books it
// `variant="tag"` is the compact link only, for summary rows.

type Booking = { id: string; booking_number: string }

const CLOSED = new Set(['cancelled', 'completed'])

export default function ItineraryBookingAction({
  itineraryId,
  status,
  variant = 'button',
  onStatusChange,
  className = '',
}: {
  itineraryId: string
  status: string | null | undefined
  variant?: 'button' | 'tag'
  /** Told when Convert confirms the itinerary, so the page's status agrees. */
  onStatusChange?: (status: string) => void
  className?: string
}) {
  const router = useRouter()
  const { confirm } = useConfirmDialog()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [checked, setChecked] = useState(false)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let cancelled = false
    createClient()
      .from('bookings')
      .select('id, booking_number')
      .eq('itinerary_id', itineraryId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setBooking(data ?? null)
        setChecked(true)
      })
    return () => {
      cancelled = true
    }
  }, [itineraryId, status])

  if (booking) {
    return variant === 'tag' ? (
      <Link
        href={`/bookings/${booking.id}`}
        title="This itinerary is booked — open the booking"
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium bg-green-50 text-green-700 border-green-200 hover:bg-green-100 ${className}`}
      >
        <BookOpen className="w-3 h-3" />
        {booking.booking_number}
      </Link>
    ) : (
      <Link
        href={`/bookings/${booking.id}`}
        className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 bg-teal-600 text-white hover:bg-teal-700 transition-colors flex-shrink-0 ${className}`}
      >
        <BookOpen className="w-4 h-4" />
        Go to Booking {booking.booking_number}
      </Link>
    )
  }

  if (variant === 'tag' || !checked || CLOSED.has(String(status))) return null

  const isConfirmed = status === 'confirmed'

  const run = async () => {
    const ok = await confirm({
      title: isConfirmed ? 'Create the booking' : 'Convert to booking',
      message: isConfirmed
        ? 'This creates the booking for this confirmed itinerary, with your deposit terms.'
        : 'This confirms the itinerary and creates its booking, with your deposit terms.',
      confirmText: isConfirmed ? 'Create Booking' : 'Convert',
      cancelText: 'Cancel',
      variant: 'info',
    })
    if (!ok) return
    setWorking(true)
    try {
      const res = isConfirmed
        ? await fetch(`/api/itineraries/${itineraryId}/booking`, { method: 'POST' })
        : await fetch(`/api/itineraries/${itineraryId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'confirmed' }),
          })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not create the booking')
      if (!isConfirmed) onStatusChange?.('confirmed')

      const made = data.booking as Booking | undefined
      if (made?.id) {
        showToast('success', `Booking ${made.booking_number} created`)
        router.push(`/bookings/${made.id}`)
        return
      }
      // Confirmed, but no booking could be made (e.g. no price) — say why.
      showToast('info', data.booking_note || 'Itinerary confirmed, but no booking was created')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not create the booking')
    } finally {
      setWorking(false)
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={working}
      className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-50 flex-shrink-0 ${className}`}
    >
      {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
      {isConfirmed ? 'Create Booking' : 'Convert to Booking'}
    </button>
  )
}
