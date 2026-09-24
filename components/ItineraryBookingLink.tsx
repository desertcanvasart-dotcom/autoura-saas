'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { createClient } from '@/app/supabase'

// Confirming an itinerary CREATES its booking (PUT /api/itineraries/[id]) —
// there is no "Convert to Booking" step for it. The only sign of that was a
// toast, so the itinerary looked unbooked and the operator went looking for a
// convert button. This shows the booking, once it exists, wherever the
// itinerary is open. `refreshKey` (the status) re-checks after a confirm.
export default function ItineraryBookingLink({
  itineraryId,
  refreshKey,
  className = '',
}: {
  itineraryId: string
  refreshKey?: string | null
  className?: string
}) {
  const [booking, setBooking] = useState<{ id: string; booking_number: string } | null>(null)

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
        if (!cancelled) setBooking(data ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [itineraryId, refreshKey])

  if (!booking) return null

  return (
    <Link
      href={`/bookings/${booking.id}`}
      title="This itinerary is booked — open the booking"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 flex-shrink-0 ${className}`}
    >
      <BookOpen className="w-3.5 h-3.5" />
      Booking {booking.booking_number} →
    </Link>
  )
}
