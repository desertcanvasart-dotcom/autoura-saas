// ============================================
// /api/bookings/[id]/extras/[eid] — pricing, confirming, withdrawing
// ============================================
// PATCH   edit the extra, act on it, or both  { action?, ...fields }
// DELETE  remove one that never became money
//
// Ported from travel-ops-pro. CONFIRM IS THE ONLY THING THAT MOVES MONEY, and
// it does so through the single recompute in ../recompute.ts. Withdrawing a
// confirmed extra runs the same recompute and takes the money back out.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { extrasAdmin } from '@/lib/booking-extras-db'
import { nextStatus, isPriced, lineAmount, type ExtraAction, type BookingExtraLine } from '@/lib/booking-extras'
import { recomputeBookingExtras } from '../recompute'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; eid: string }> }

const ACTIONS = new Set<ExtraAction>(['price', 'accept', 'decline', 'confirm', 'withdraw'])

const EXTRA_COLS =
  'id, booking_id, passenger_id, kind, title, description, quantity, unit_price, currency, supplier_cost, supplier_currency, supplier_id, source_kind, source_id, replaces_service_id, status, requested_via, created_at, priced_at, confirmed_at, confirmed_by, resolved_at, invoiced_at, invoice_id'

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const tenantId = auth.tenant_id
  const { id, eid } = await params
  const admin = extrasAdmin()

  const { data: extra } = await admin
    .from('booking_extras')
    .select(EXTRA_COLS)
    .eq('id', eid)
    .eq('booking_id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!extra) return NextResponse.json({ error: 'Extra not found' }, { status: 404 })

  if (extra.invoiced_at) {
    // Once it is on a customer's invoice it is a document, not a draft.
    return NextResponse.json(
      { error: 'This extra has already been invoiced. Issue a credit or a new invoice instead.' },
      { status: 409 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}

  // ---------- the editable fields ----------
  if (typeof body?.title === 'string') {
    const title = body.title.trim()
    if (!title) return NextResponse.json({ error: 'A title is required' }, { status: 400 })
    updates.title = title
  }
  if (body?.description !== undefined) {
    updates.description = typeof body.description === 'string' ? body.description.slice(0, 2000) : null
  }
  if (body?.quantity !== undefined) {
    const q = Math.floor(Number(body.quantity))
    if (!Number.isFinite(q) || q < 1) return NextResponse.json({ error: 'Quantity must be at least 1' }, { status: 400 })
    updates.quantity = q
  }
  if (body?.unit_price !== undefined) {
    if (body.unit_price === null || body.unit_price === '') {
      updates.unit_price = null
      updates.currency = null
      updates.priced_at = null
    } else {
      const price = Number(body.unit_price)
      const currency =
        typeof body?.currency === 'string' && body.currency.trim() ? body.currency.trim().toUpperCase() : extra.currency || null
      if (!isPriced({ unit_price: price, currency })) {
        return NextResponse.json({ error: 'That price is not a usable amount' }, { status: 400 })
      }
      updates.unit_price = price
      updates.currency = currency
      updates.priced_at = new Date().toISOString()
    }
  } else if (typeof body?.currency === 'string' && body.currency.trim()) {
    updates.currency = body.currency.trim().toUpperCase()
  }
  if (body?.supplier_cost !== undefined) {
    if (body.supplier_cost === null || body.supplier_cost === '') {
      updates.supplier_cost = null
      updates.supplier_currency = null
    } else {
      const cost = Number(body.supplier_cost)
      if (!Number.isFinite(cost) || cost < 0) {
        return NextResponse.json({ error: 'That supplier cost is not a usable amount' }, { status: 400 })
      }
      updates.supplier_cost = cost
      updates.supplier_currency =
        (typeof body?.supplier_currency === 'string' && body.supplier_currency.trim()
          ? body.supplier_currency.trim().toUpperCase()
          : extra.supplier_currency) || updates.currency || extra.currency || null
    }
  }
  if (body?.supplier_id !== undefined) {
    updates.supplier_id = typeof body.supplier_id === 'string' && body.supplier_id ? body.supplier_id : null
  }

  // ---------- the action ----------
  let moneyMoves = false
  const action = body?.action
  if (action !== undefined) {
    if (!ACTIONS.has(action)) return NextResponse.json({ error: `Unknown action: ${String(action)}` }, { status: 400 })
    // Judged against the extra AS IT WILL BE — pricing and confirming in one
    // request has to see the new price, not the old blank.
    const after = {
      unit_price: (updates.unit_price !== undefined ? updates.unit_price : extra.unit_price) as number | null,
      currency: (updates.currency !== undefined ? updates.currency : extra.currency) as string | null,
    }
    const decision = nextStatus(extra.status, action, after)
    if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: 409 })

    updates.status = decision.status
    moneyMoves = decision.moneyMoves

    if (decision.status === 'confirmed') {
      updates.confirmed_at = new Date().toISOString()
      updates.confirmed_by = auth.user.id
    }
    if (decision.status === 'declined' || decision.status === 'withdrawn') {
      updates.resolved_at = new Date().toISOString()
      // Withdrawing a confirmed extra un-sells it; the stamp would otherwise
      // read as though it were still sold.
      updates.confirmed_at = null
    }
  }

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
  updates.updated_at = new Date().toISOString()

  const { data: saved, error } = await admin
    .from('booking_extras')
    .update(updates)
    .eq('id', eid)
    .eq('tenant_id', tenantId)
    .select(EXTRA_COLS)
    .single()
  if (error) {
    console.error('booking extras: could not update', error)
    return NextResponse.json({ error: 'Could not update the extra' }, { status: 500 })
  }

  // A priced change to an already-confirmed extra moves money too, not just a
  // status change — recompute whenever the extra is or was confirmed.
  const totalsChanged = moneyMoves || extra.status === 'confirmed' || saved.status === 'confirmed'

  let totals = null
  if (totalsChanged) {
    const result = await recomputeBookingExtras(admin, id, tenantId)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    totals = result
  }

  if (saved.status === 'confirmed' && extra.status !== 'confirmed') {
    await addToSupplierManifest(tenantId, id, saved)
  }

  return NextResponse.json({
    success: true,
    extra: { ...saved, line_amount: lineAmount(saved as BookingExtraLine) },
    totals,
  })
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const tenantId = auth.tenant_id
  const { id, eid } = await params
  const admin = extrasAdmin()

  const { data: extra } = await admin
    .from('booking_extras')
    .select('id, status, invoiced_at, confirmed_at')
    .eq('id', eid)
    .eq('booking_id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!extra) return NextResponse.json({ error: 'Extra not found' }, { status: 404 })

  // Anything that ever became money stays on the record. Withdraw it instead —
  // that reverses the total and leaves the history intact.
  if (extra.status === 'confirmed' || extra.confirmed_at || extra.invoiced_at) {
    return NextResponse.json(
      { error: 'This extra was sold. Withdraw it rather than deleting it, so the change is on the record.' },
      { status: 409 }
    )
  }

  const { error } = await admin.from('booking_extras').delete().eq('id', eid).eq('tenant_id', tenantId)
  if (error) return NextResponse.json({ error: 'Could not delete the extra' }, { status: 500 })
  return NextResponse.json({ success: true })
}

/**
 * Put a confirmed extra on the booking's supplier manifest, so operations
 * confirm it like every other service rather than discovering it on an invoice.
 * Best-effort: the sale is the valuable record.
 */
async function addToSupplierManifest(tenantId: string, bookingId: string, extra: Record<string, unknown>) {
  if (!extra.supplier_id && !extra.supplier_cost) return
  const admin = extrasAdmin()
  const { data: supplier } = extra.supplier_id
    ? await admin.from('suppliers').select('name').eq('id', String(extra.supplier_id)).maybeSingle()
    : { data: null }

  const { error } = await admin.from('booking_supplier_status').insert({
    tenant_id: tenantId,
    booking_id: bookingId,
    supplier_id: typeof extra.supplier_id === 'string' ? extra.supplier_id : null,
    supplier_type: 'other',
    supplier_name: supplier?.name || String(extra.title),
    service_description: `Extra: ${String(extra.title)}`,
    quoted_cost: typeof extra.supplier_cost === 'number' ? extra.supplier_cost : null,
    status: 'pending',
  })
  if (error) console.error('extras: could not add to supplier manifest', error)
}
