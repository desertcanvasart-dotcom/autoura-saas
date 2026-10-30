import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { syncSupplierExpense } from '@/lib/bookings/supplier-expense'
import { roleDenied } from '@/lib/api-role-gate'
import { STORED_STATUSES, isCovered } from '@/lib/bookings/service-booking-states'
import { recordServiceBookingEvent } from '@/lib/bookings/service-booking-events'

// GET - List suppliers for a booking
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const { id } = await params

    const { data, error } = await supabase
      .from('booking_supplier_status')
      .select('*')
      .eq('booking_id', id)
      .order('service_date', { ascending: true })

    if (error) {
      console.error('Error fetching suppliers:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Each row's expense (made when it was confirmed), for the panel's link.
    const ids = (data || []).map(r => r.id as string)
    const expenseByRow = new Map<string, unknown>()
    if (ids.length) {
      const { data: expenses, error: expErr } = await supabase
        .from('expenses')
        .select('id, expense_number, status, amount, currency, booking_supplier_status_id')
        .in('booking_supplier_status_id', ids)
      if (expErr) console.error('Error fetching supplier expenses:', expErr.message)
      for (const e of expenses || []) expenseByRow.set(e.booking_supplier_status_id as string, e)
    }

    return NextResponse.json({
      success: true,
      data: (data || []).map(r => ({ ...r, expense: expenseByRow.get(r.id as string) ?? null })),
    })
  } catch (error) {
    console.error('Suppliers GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Add supplier or update existing
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied
    const { supabase, tenant_id, user } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const actor = { tenantId: tenant_id, bookingId: id, actor: 'operator' as const, channel: 'app' as const, actorUserId: user?.id ?? null, actorLabel: user?.email ?? null }

    // Update existing supplier
    if (body.id) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      let fromStatus: string | null = null
      if (body.status !== undefined) {
        if (!STORED_STATUSES.includes(body.status)) {
          return NextResponse.json({ success: false, error: `status must be one of: ${STORED_STATUSES.join(', ')}` }, { status: 400 })
        }
        const { data: before } = await supabase
          .from('booking_supplier_status').select('status').eq('id', body.id).eq('booking_id', id).maybeSingle()
        fromStatus = before?.status ?? null
        updates.status = body.status
        // Leaving a covered state clears the stamp; the booking's own status
        // is the operator's call (checked against these rows when it moves on).
        if (!isCovered(body.status)) updates.confirmed_at = null
      }
      if (body.confirmation_number !== undefined) updates.confirmation_number = body.confirmation_number
      if (body.confirmation_notes !== undefined) updates.confirmation_notes = body.confirmation_notes
      if (body.confirmed_cost !== undefined) {
        const cost = body.confirmed_cost === null || body.confirmed_cost === '' ? null : Number(body.confirmed_cost)
        if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
          return NextResponse.json({ success: false, error: 'confirmed_cost must be a positive number' }, { status: 400 })
        }
        updates.confirmed_cost = cost
      }
      if (body.status !== undefined && isCovered(body.status) && !isCovered(fromStatus)) {
        updates.confirmed_at = new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('booking_supplier_status')
        .update(updates)
        .eq('id', body.id)
        .eq('booking_id', id)
        .select()
        .single()

      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

      // Every status change is in the line's history (446). The save stands
      // even if the event cannot be written; the log says so.
      if (body.status !== undefined && body.status !== fromStatus) {
        const logged = await recordServiceBookingEvent(supabase, { ...actor, serviceBookingId: data.id, fromStatus, toStatus: body.status })
        if (!logged.ok) console.error('[bookings/suppliers] event:', logged.error)
      }

      // Confirmed with a cost → the trip owes this supplier: keep its expense
      // in step (lib/bookings/supplier-expense). The status save stands even
      // if this fails; the panel says the expense was not recorded.
      const sync = await syncSupplierExpense(supabase, tenant_id, data.id)
      if (!sync.ok) {
        console.error('[bookings/suppliers] expense sync:', sync.error)
        return NextResponse.json({ success: true, data: { ...data, expense: null }, expense_error: 'Saved, but the expense could not be recorded' })
      }
      return NextResponse.json({ success: true, data: { ...data, expense: sync.expense }, expense_action: sync.action })
    }

    // Create new supplier entry
    if (!body.supplier_type || !body.supplier_name) {
      return NextResponse.json({ success: false, error: 'supplier_type and supplier_name are required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('booking_supplier_status')
      .insert({
        tenant_id,
        booking_id: id,
        supplier_id: body.supplier_id || null,
        supplier_type: body.supplier_type,
        supplier_name: body.supplier_name,
        service_description: body.service_description || null,
        service_date: body.service_date || null,
        contact_name: body.contact_name || null,
        contact_email: body.contact_email || null,
        contact_phone: body.contact_phone || null,
        quoted_cost: body.quoted_cost || null,
        status: 'pending',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    const logged = await recordServiceBookingEvent(supabase, { ...actor, serviceBookingId: data.id, toStatus: 'pending', note: 'Added by hand' })
    if (!logged.ok) console.error('[bookings/suppliers] event:', logged.error)
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error('Suppliers POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
