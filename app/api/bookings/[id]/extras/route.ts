// ============================================
// /api/bookings/[id]/extras — what was sold after the trip was sold
// ============================================
// GET   every extra on the booking, with what it adds up to
// POST  the office records a new one
//
// Ported from travel-ops-pro. An extra is created UNPRICED ('requested') or
// PRICED ('offered'). It is never created confirmed: confirming is a separate,
// deliberate act because it is the act that moves money.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { extrasAdmin } from '@/lib/booking-extras-db'
import { extrasTotal, isPriced, lineAmount, type BookingExtraLine } from '@/lib/booking-extras'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export const EXTRA_SELECT =
  'id, booking_id, passenger_id, kind, title, description, quantity, unit_price, currency, ' +
  'supplier_cost, supplier_currency, supplier_id, source_kind, source_id, replaces_service_id, ' +
  'status, requested_via, created_at, priced_at, confirmed_at, resolved_at, invoiced_at, invoice_id'

async function loadBooking(bookingId: string, tenantId: string) {
  // base_total_cost / extras_total are named on purpose: a deployment running
  // ahead of migration 321 errors here, and the panel says so, rather than
  // quietly showing totals that cannot be right.
  const { data } = await extrasAdmin()
    .from('bookings')
    .select('id, tenant_id, currency, total_amount, deposit_amount, deposit_percent, total_paid, balance_due, base_total_cost, extras_total')
    .eq('id', bookingId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return data
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const tenantId = auth.tenant_id
  const { id } = await params

  const booking = await loadBooking(id, tenantId)
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const { data, error } = await extrasAdmin()
    .from('booking_extras')
    .select(EXTRA_SELECT)
    .eq('booking_id', id)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Could not load extras' }, { status: 500 })

  const extras = (data ?? []) as unknown as BookingExtraLine[]
  const totals = extrasTotal(extras, booking.currency || 'EUR')

  return NextResponse.json({
    currency: booking.currency || 'EUR',
    booking: {
      total_amount: booking.total_amount,
      base_total_cost: booking.base_total_cost ?? booking.total_amount,
      extras_total: booking.extras_total ?? 0,
    },
    extras: extras.map(e => ({ ...e, line_amount: lineAmount(e) })),
    // What the CONFIRMED ones come to, recomputed rather than read back, so the
    // panel shows the same number the next recompute would write.
    confirmed_total: totals.ok ? totals.total : null,
    excluded: totals.ok ? totals.excluded : [],
    problem: totals.ok ? null : `Confirmed but unpriced: ${totals.unpriced.join(', ')}`,
  })
}

const KINDS = new Set(['addon', 'upgrade'])

export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const tenantId = auth.tenant_id
  const { id } = await params
  const admin = extrasAdmin()

  const booking = await loadBooking(id, tenantId)
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))

  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'A title is required' }, { status: 400 })

  const kind = KINDS.has(body?.kind) ? body.kind : 'addon'

  const quantity = Number.isFinite(Number(body?.quantity)) ? Math.floor(Number(body.quantity)) : 1
  if (quantity < 1) return NextResponse.json({ error: 'Quantity must be at least 1' }, { status: 400 })

  // The price is optional — an extra can be recorded before it is quoted — but
  // half a price is not a price, so it is taken as a pair or not at all.
  const hasPrice = body?.unit_price !== undefined && body?.unit_price !== null && body?.unit_price !== ''
  const unitPrice = hasPrice ? Number(body.unit_price) : null
  const currency = hasPrice
    ? (typeof body?.currency === 'string' && body.currency.trim() ? body.currency.trim().toUpperCase() : (booking.currency || 'EUR'))
    : null
  if (hasPrice && !isPriced({ unit_price: unitPrice, currency })) {
    return NextResponse.json({ error: 'That price is not a usable amount' }, { status: 400 })
  }

  const hasCost = body?.supplier_cost !== undefined && body?.supplier_cost !== null && body?.supplier_cost !== ''
  const supplierCost = hasCost ? Number(body.supplier_cost) : null
  if (hasCost && (!Number.isFinite(supplierCost as number) || (supplierCost as number) < 0)) {
    return NextResponse.json({ error: 'That supplier cost is not a usable amount' }, { status: 400 })
  }

  // A traveller-scoped extra has to be a traveller ON THIS BOOKING — a
  // passenger id alone must not attach a charge to somebody else's trip.
  let passengerId: string | null = null
  if (typeof body?.passenger_id === 'string' && body.passenger_id) {
    const { data: pax } = await admin
      .from('booking_passengers')
      .select('id')
      .eq('id', body.passenger_id)
      .eq('booking_id', id)
      .maybeSingle()
    if (!pax) return NextResponse.json({ error: 'That traveller is not on this booking' }, { status: 400 })
    passengerId = body.passenger_id
  }

  const row = {
    tenant_id: tenantId,
    booking_id: id,
    passenger_id: passengerId,
    kind,
    title,
    description: typeof body?.description === 'string' ? body.description.slice(0, 2000) : null,
    quantity,
    unit_price: unitPrice,
    currency,
    supplier_cost: supplierCost,
    supplier_currency: hasCost
      ? (typeof body?.supplier_currency === 'string' && body.supplier_currency.trim()
          ? body.supplier_currency.trim().toUpperCase()
          : currency || booking.currency || 'EUR')
      : null,
    supplier_id: typeof body?.supplier_id === 'string' && body.supplier_id ? body.supplier_id : null,
    source_kind: typeof body?.source_kind === 'string' ? body.source_kind : 'manual',
    source_id: typeof body?.source_id === 'string' && body.source_id ? body.source_id : null,
    replaces_service_id:
      typeof body?.replaces_service_id === 'string' && body.replaces_service_id ? body.replaces_service_id : null,
    // Priced on arrival means it is already an offer the customer can answer.
    status: hasPrice ? 'offered' : 'requested',
    requested_via: 'operator',
    created_by: auth.user.id,
    priced_at: hasPrice ? new Date().toISOString() : null,
  }

  const { data, error } = await admin.from('booking_extras').insert(row).select(EXTRA_SELECT).single()
  if (error) {
    console.error('booking extras: could not add', error)
    return NextResponse.json({ error: 'Could not add the extra' }, { status: 500 })
  }

  // Nothing is confirmed by creating one, so no money has moved and there is
  // nothing to recompute.
  const created = data as unknown as BookingExtraLine
  return NextResponse.json({ success: true, extra: { ...created, line_amount: lineAmount(created) } })
}
