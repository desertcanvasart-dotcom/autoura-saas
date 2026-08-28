// GET /api/dashboard/attention — what needs a human before a group flies (C4)
//
// A thin fetch layer over lib/dashboard/attention.ts, which holds every rule
// and is unit-tested without a database. RLS scopes each read to the caller's
// tenant. Any missing table (a migration not applied yet) degrades that
// signal to empty rather than failing the whole list — a dashboard that
// answers nothing is worse than one that answers most of it.

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import {
  buildAttentionItems,
  HORIZON_DAYS,
  BALANCE_SOON_DAYS,
  type AttentionBooking,
  type AttentionPassenger,
  type AttentionChangeRequest,
} from '@/lib/dashboard/attention'

const BOOKING_COLS =
  'id, booking_number, trip_name, client_id, start_date, status, itinerary_id, balance_due, payment_deadline'

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10)

export async function GET() {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const today = day(0)

    const [departing, balanceDue] = await Promise.all([
      supabase
        .from('bookings')
        .select(BOOKING_COLS)
        .neq('status', 'cancelled')
        .gte('start_date', today)
        .lte('start_date', day(HORIZON_DAYS))
        .order('start_date', { ascending: true }),
      supabase
        .from('bookings')
        .select(BOOKING_COLS)
        .neq('status', 'cancelled')
        .gte('start_date', today)
        .gt('balance_due', 0)
        .lte('payment_deadline', day(BALANCE_SOON_DAYS))
        .order('payment_deadline', { ascending: true }),
    ])
    if (departing.error) {
      console.error('attention: bookings read failed:', departing.error.message)
      return NextResponse.json({ success: true, data: { items: [], scannedBookings: 0 } })
    }

    const rows = [...(departing.data ?? []), ...(balanceDue.data ?? [])] as AttentionBooking[]
    const bookingIds = [...new Set(rows.map(b => b.id))]
    const itineraryIds = [...new Set(rows.map(b => b.itinerary_id).filter((v): v is string => !!v))]
    const clientIds = [...new Set(rows.map(b => b.client_id).filter((v): v is string => !!v))]

    if (bookingIds.length === 0) {
      return NextResponse.json({ success: true, data: { items: [], scannedBookings: 0 } })
    }

    const [passengers, changeRequests, itineraries, clients] = await Promise.all([
      supabase
        .from('booking_passengers')
        .select('booking_id, passport_number, date_of_birth')
        .in('booking_id', bookingIds),
      supabase
        .from('booking_change_requests')
        .select('booking_id, kind, requested_count, created_at')
        .eq('status', 'pending')
        .in('booking_id', bookingIds),
      itineraryIds.length
        ? supabase.from('itineraries').select('id, assigned_guide_id').in('id', itineraryIds)
        : Promise.resolve({ data: [], error: null }),
      clientIds.length
        ? supabase.from('clients').select('id, full_name').in('id', clientIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    // A signal whose table is absent (migration pending) contributes nothing
    // rather than sinking the whole list.
    const guideByItinerary = new Map<string, string | null>()
    for (const it of (itineraries.data ?? []) as Array<{ id: string; assigned_guide_id: string | null }>) {
      guideByItinerary.set(it.id, it.assigned_guide_id)
    }
    const clientNames = new Map<string, string>()
    for (const c of (clients.data ?? []) as Array<{ id: string; full_name: string | null }>) {
      if (c.full_name) clientNames.set(c.id, c.full_name)
    }

    const result = buildAttentionItems({
      departing: (departing.data ?? []) as AttentionBooking[],
      balanceDue: (balanceDue.data ?? []) as AttentionBooking[],
      passengers: (passengers.data ?? []) as AttentionPassenger[],
      changeRequests: (changeRequests.data ?? []) as AttentionChangeRequest[],
      guideByItinerary,
      clientNames,
      today,
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('Error building attention list:', error)
    return NextResponse.json({ success: false, error: 'Failed to build the attention list' }, { status: 500 })
  }
}
