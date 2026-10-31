'use client'

// ============================================
// Convert to Booking — one button for both quote pages
// ============================================
// A quote converts once. The button used to stay live after that, with no way
// to the booking it made; and a quote with unpriced services was refused with
// "confirm booking it as it is" and no way to confirm. Now: an existing
// booking is linked instead of the button, and a refusal for missing prices
// asks before booking the quote as it is (allow_incomplete).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BookOpen, Loader2 } from 'lucide-react'
import { createClient } from '@/app/supabase'
import { showToast } from '@/app/contexts/ToastContext'
import { useConfirmDialog } from '@/components/ConfirmDialog'

interface Props {
  quoteId: string
  quoteType: 'b2c' | 'b2b'
  quoteNumber: string
  status: string
}

export default function ConvertToBookingButton({ quoteId, quoteType, quoteNumber, status }: Props) {
  const router = useRouter()
  const dialog = useConfirmDialog()
  const [converting, setConverting] = useState(false)
  const [booking, setBooking] = useState<{ id: string; booking_number: string | null } | null>(null)

  useEffect(() => {
    let live = true
    createClient()
      .from('bookings')
      .select('id, booking_number')
      .eq('quote_id', quoteId)
      .eq('quote_type', quoteType)
      .limit(1)
      .then(({ data }) => { if (live) setBooking(data?.[0] ?? null) })
    return () => { live = false }
  }, [quoteId, quoteType])

  const convert = async () => {
    if (!(await dialog.confirm({
      message: `Create a booking from quote ${quoteNumber}? A quote can only be converted once.`,
      confirmText: 'Create booking',
    }))) return
    setConverting(true)
    try {
      let allowIncomplete = false
      let overrideCapacity = false
      const post = () => fetch('/api/bookings/from-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quote_id: quoteId, quote_type: quoteType,
          ...(allowIncomplete ? { allow_incomplete: true } : {}),
          ...(overrideCapacity ? { override_capacity: true } : {}),
        }),
      })
      let res = await post()
      let data = await res.json()
      // Unpriced services: the operator decides.
      if (res.status === 422 && Array.isArray(data.gaps) && data.gaps.length > 0) {
        const ok = await dialog.confirm({
          title: 'Some services have no price',
          message: `${data.error}\n\nBook it as it is? The booking keeps the quote's price; the missing services are not charged.`,
          confirmText: 'Book as it is',
          variant: 'warning',
        })
        if (!ok) { setConverting(false); return }
        allowIncomplete = true
        res = await post()
        data = await res.json()
      }
      // A full or closed day on the Capacity Calendar: a manager or admin may
      // book it anyway; anyone else is told why.
      if (res.status === 409 && Array.isArray(data.capacity) && data.capacity.length > 0 && data.can_override) {
        const ok = await dialog.confirm({
          title: 'Over capacity',
          message: `${data.error}\n\nBook it anyway?`,
          confirmText: 'Book anyway',
          variant: 'warning',
        })
        if (!ok) { setConverting(false); return }
        overrideCapacity = true
        res = await post()
        data = await res.json()
      }
      if (!res.ok || !data.success) {
        // Already booked: show where.
        if (data.booking_id) setBooking({ id: data.booking_id, booking_number: data.booking_number ?? null })
        showToast('error', data.error || 'Failed to create booking')
        setConverting(false)
        return
      }
      showToast('success', 'Booking created')
      router.push(`/bookings/${data.data.id}`)
    } catch {
      showToast('error', 'Failed to create booking')
      setConverting(false)
    }
  }

  if (booking) {
    return (
      <Link
        href={`/bookings/${booking.id}`}
        className="h-10 px-4 whitespace-nowrap shrink-0 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-[#566b3c] inline-flex items-center justify-center gap-2"
      >
        <BookOpen className="w-4 h-4" />
        View booking{booking.booking_number ? ` ${booking.booking_number}` : ''}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={convert}
      disabled={converting || status !== 'accepted'}
      title={status !== 'accepted' ? 'Only accepted quotes can be converted — set the status to Accepted first' : 'Create a booking from this quote'}
      className="h-10 px-4 whitespace-nowrap shrink-0 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-[#566b3c] inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {converting ? (
        <><Loader2 className="w-4 h-4 animate-spin" />Converting...</>
      ) : (
        <><BookOpen className="w-4 h-4" />Convert to Booking</>
      )}
    </button>
  )
}
