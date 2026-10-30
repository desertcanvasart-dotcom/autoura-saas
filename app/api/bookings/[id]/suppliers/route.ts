import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { syncSupplierExpense, type SupplierExpenseResult } from '@/lib/bookings/supplier-expense'
import { roleDenied } from '@/lib/api-role-gate'
import { SERVICE_BOOKING_STATUSES, type ServiceBookingStatus } from '@/lib/bookings/service-booking-states'
import { recordServiceBookingEvent } from '@/lib/bookings/service-booking-events'
import { transitionServiceBooking } from '@/lib/bookings/service-booking-transition'

// GET - List suppliers for a booking
function seenAt(link: Map<string, string | null>, page: Map<string, string | null>, lineId: string, supplierId: string | null) {
  const hasLink = link.has(lineId)
  const hasPage = !!supplierId && page.has(supplierId)
  if (!hasLink && !hasPage) return undefined
  const times = [link.get(lineId), supplierId ? page.get(supplierId) : null].filter((t): t is string => !!t)
  times.sort()
  return times.length ? times[times.length - 1] : null
}

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

    // Days off the line's supplier marked for that day (a warning — lib/supplier-days-off).
    const supplierIds = [...new Set((data || []).map(r => r.supplier_id as string | null).filter(Boolean))] as string[]
    const offKeys = new Set<string>()
    if (supplierIds.length) {
      const { data: off, error: offErr } = await supabase
        .from('supplier_unavailable_days').select('supplier_id, day').in('supplier_id', supplierIds)
      if (offErr) console.error('Error fetching supplier days off:', offErr.message)
      for (const o of off || []) offKeys.add(`${o.supplier_id}:${String(o.day).slice(0, 10)}`)
    }

    // Has the supplier opened the request, or their own page? (448 / 449)
    const lineIds = (data || []).map(r => r.id as string)
    const linkOpened = new Map<string, string | null>()
    const pageOpened = new Map<string, string | null>()
    if (lineIds.length) {
      const { data: links, error: linkErr } = await supabase
        .from('service_booking_links').select('service_booking_id, last_opened_at').in('service_booking_id', lineIds).is('revoked_at', null)
      if (linkErr) console.error('Error fetching reply links:', linkErr.message)
      for (const l of links || []) linkOpened.set(l.service_booking_id as string, (l.last_opened_at as string | null) ?? null)
    }
    if (supplierIds.length) {
      const { data: pages, error: pageErr } = await supabase
        .from('supplier_portal_links').select('supplier_id, last_opened_at').in('supplier_id', supplierIds).is('revoked_at', null)
      if (pageErr) console.error('Error fetching supplier pages:', pageErr.message)
      for (const p of pages || []) pageOpened.set(p.supplier_id as string, (p.last_opened_at as string | null) ?? null)
    }

    return NextResponse.json({
      success: true,
      data: (data || []).map(r => ({
        ...r,
        // The later of the request link and their page being opened; null = sent, not opened; absent = no link.
        seen: seenAt(linkOpened, pageOpened, r.id as string, r.supplier_id as string | null),
        expense: expenseByRow.get(r.id as string) ?? null,
        supplier_day_off: !!(r.supplier_id && r.service_date && offKeys.has(`${r.supplier_id}:${String(r.service_date).slice(0, 10)}`)),
      })),
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

    // Update an existing service booking
    if (body.id) {
      // The fields first, then the status: the move then records the expense
      // on the new cost.
      const updates: Record<string, unknown> = {}
      if (body.confirmation_number !== undefined) updates.confirmation_number = body.confirmation_number
      if (body.confirmation_notes !== undefined) updates.confirmation_notes = body.confirmation_notes
      if (body.confirmed_cost !== undefined) {
        const cost = body.confirmed_cost === null || body.confirmed_cost === '' ? null : Number(body.confirmed_cost)
        if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
          return NextResponse.json({ success: false, error: 'confirmed_cost must be a positive number' }, { status: 400 })
        }
        updates.confirmed_cost = cost
      }
      if (body.status !== undefined && !(SERVICE_BOOKING_STATUSES as readonly string[]).includes(body.status)) {
        return NextResponse.json({ success: false, error: `status must be one of: ${SERVICE_BOOKING_STATUSES.join(', ')}` }, { status: 400 })
      }

      let data: Record<string, unknown> | null = null
      if (Object.keys(updates).length) {
        const res = await supabase
          .from('booking_supplier_status')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', body.id)
          .eq('booking_id', id)
          .select()
          .maybeSingle()
        if (res.error) return NextResponse.json({ success: false, error: res.error.message }, { status: 500 })
        if (!res.data) return NextResponse.json({ success: false, error: 'Service booking not found' }, { status: 404 })
        data = res.data
      }

      // A status change: checked, stamped, in the line's history, expense in
      // step (lib/bookings/service-booking-transition).
      let sync: SupplierExpenseResult
      if (body.status !== undefined) {
        const moved = await transitionServiceBooking(supabase, tenant_id, {
          id: body.id, bookingId: id, to: body.status as ServiceBookingStatus,
          actor: 'operator', channel: 'app', actorUserId: user?.id ?? null, actorLabel: user?.email ?? null,
        })
        if (!moved.ok) return NextResponse.json({ success: false, error: moved.error }, { status: moved.status })
        data = moved.row
        sync = moved.expense
      } else {
        // Cost or confirmation number only → the expense follows the cost.
        sync = await syncSupplierExpense(supabase, tenant_id, body.id)
      }

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
    const logged = await recordServiceBookingEvent(supabase, {
      tenantId: tenant_id, bookingId: id, serviceBookingId: data.id, actor: 'operator', channel: 'app',
      actorUserId: user?.id ?? null, actorLabel: user?.email ?? null, toStatus: 'pending', note: 'Added by hand',
    })
    if (!logged.ok) console.error('[bookings/suppliers] event:', logged.error)
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error('Suppliers POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
