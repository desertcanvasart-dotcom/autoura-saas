import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { SAME_SERVICE_KEYS, alternativeCost, ownResourceTypes } from '@/lib/bookings/cover-options'
import { loadCoverLine, loadSameServiceRates, supplierAlternatives } from '@/lib/bookings/cover-lookup'
import { normalizeStatus } from '@/lib/bookings/service-booking-states'
import { recordServiceBookingEvent } from '@/lib/bookings/service-booking-events'
import { transitionServiceBooking } from '@/lib/bookings/service-booking-transition'
import { computeConflicts } from '@/lib/itinerary-resource-conflicts'
import { offOn } from '@/lib/supplier-days-off'
import { SUPPLIER_KINDS_FOR_LINE } from '@/lib/bookings/service-label'
import { bySourcing, usesNetwork } from '@/lib/supplier-network'

// ============================================
// Who covers this service line (lib/bookings/cover-options)
// ============================================
// GET  → the agency's own people/cars that can do it, and the suppliers with
//        a rate for the same service (with what it would cost there).
// POST → { kind: 'own', resource_type, resource_id }  assign directly: an
//          itinerary_resources assignment, the line becomes Assigned; a
//          clash with another trip is a warning, not a block;
//        { kind: 'supplier', supplier_id }  the supplier to request from;
//          the cost becomes theirs, or none (a gap) when they have no rate.
// The line must be To arrange, Declined or No reply — move it back to
// To arrange first to change who covers an accepted or assigned line.

type Ctx = { params: Promise<{ id: string; lineId: string }> }

const CHANGEABLE = ['pending', 'declined', 'expired']

async function ownOptions(db: SupabaseClient, tenantId: string, types: string[]) {
  const out: Array<{ resource_type: string; resource_id: string; name: string; detail: string | null }> = []
  for (const t of types) {
    if (t === 'vehicle') {
      const { data } = await db.from('vehicles').select('id, name, license_plate, vehicle_type, passenger_capacity, supplier_id')
        .eq('tenant_id', tenantId).neq('is_active', false)
      for (const v of data ?? []) {
        const label = [v.name, v.vehicle_type].filter(Boolean).join(' · ') || 'Car'
        out.push({ resource_type: 'vehicle', resource_id: v.id as string, name: label, detail: (v.license_plate as string | null) || null })
      }
    } else if (t === 'driver') {
      const { data } = await db.from('team_members').select('id, name, phone').eq('tenant_id', tenantId).eq('staff_type', 'driver').neq('is_active', false)
      for (const d of data ?? []) out.push({ resource_type: 'driver', resource_id: d.id as string, name: d.name as string, detail: (d.phone as string | null) || null })
    } else if (t === 'guide') {
      const { data } = await db.from('suppliers').select('id, name, company_name, languages').eq('tenant_id', tenantId).eq('supplier_type', 'guide').neq('is_active', false)
      for (const g of data ?? []) {
        const langs = Array.isArray(g.languages) ? (g.languages as string[]).join(', ') : null
        out.push({ resource_type: 'guide', resource_id: g.id as string, name: (g.name || g.company_name) as string, detail: langs })
      }
    } else if (t === 'airport_staff' || t === 'hotel_staff') {
      const { data } = await db.from(t).select('id, name, role').eq('tenant_id', tenantId).neq('is_active', false)
      for (const s of data ?? []) out.push({ resource_type: t, resource_id: s.id as string, name: s.name as string, detail: (s.role as string | null) || null })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
  const { id, lineId } = await params

  const found = await loadCoverLine(supabase, tenant_id, id, lineId)
  if (!found) return NextResponse.json({ success: false, error: 'Service booking not found' }, { status: 404 })
  const { line, rateTable, rateId } = found

  const [own, supplierOptions, { data: daysOff }] = await Promise.all([
    ownOptions(supabase, tenant_id, ownResourceTypes(line.supplier_type, rateTable)),
    supplierAlternatives(supabase, tenant_id, line, rateTable, rateId),
    line.service_date
      ? supabase.from('supplier_unavailable_days').select('supplier_id, day').eq('tenant_id', tenant_id).eq('day', line.service_date)
      : Promise.resolve({ data: [] as Array<{ supplier_id: string; day: string }> }),
  ])
  // Days off are a warning, never a block (lib/supplier-days-off). Guides are
  // suppliers, so an own guide's resource_id is a supplier id too.
  const off = offOn((daysOff ?? []) as Array<{ supplier_id: string; day: string }>, line.service_date)

  // Every other supplier of this kind in the agency's book, with no cost (a
  // gap the office fills with what they agree) — without these, a line whose
  // rate names no supplier offered nobody at all (2026-10-30 click-through).
  const kinds = SUPPLIER_KINDS_FOR_LINE[line.supplier_type] ?? [line.supplier_type]
  const [{ data: sameKind }, { data: tenantRow }] = await Promise.all([
    supabase.from('suppliers').select('id, name, company_name, supplier_type, types, is_active, network_account_id')
      .eq('tenant_id', tenant_id).limit(500),
    supabase.from('tenants').select('supplier_sourcing').eq('id', tenant_id).maybeSingle(),
  ])
  const sourcing = (tenantRow?.supplier_sourcing as string | null) ?? 'own'
  // Network copies (added from the shared network) are grouped and filtered by the sourcing setting.
  const networkIds = new Set((sameKind ?? []).filter(s => s.network_account_id).map(s => s.id as string))
  const priced = new Set(supplierOptions.map(o => o.supplier_id))
  const otherSuppliers = (sameKind ?? [])
    .filter(s => s.is_active !== false && !priced.has(s.id as string))
    .filter(s => kinds.includes(String(s.supplier_type ?? '')) || ((s.types as string[] | null) ?? []).some(t => kinds.includes(t)))
    .map(s => ({
      supplier_id: s.id as string,
      name: ((s.name || s.company_name) as string | null) ?? 'Supplier',
      cost: null,
      no_cost_reason: 'no rate for this service — enter what they agree',
      preferred: false,
      other: true,
      network: networkIds.has(s.id as string),
      day_off: off.has(s.id as string),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({
    success: true,
    data: {
      can_change: CHANGEABLE.includes(normalizeStatus(line.status)),
      own: own.map(o => ({ ...o, day_off: o.resource_type === 'guide' && off.has(o.resource_id) })),
      suppliers: bySourcing([
        ...supplierOptions.map(o => ({ ...o, network: networkIds.has(o.supplier_id), day_off: off.has(o.supplier_id) })),
        ...otherSuppliers,
      ], sourcing),
      compares_rates: !!(rateTable && SAME_SERVICE_KEYS[rateTable]),
      uses_network: usesNetwork(sourcing),
    },
  })
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'manage')
  if (denied) return denied
  const { supabase, tenant_id, user } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
  const { id, lineId } = await params
  const body = await request.json().catch(() => ({}))

  const found = await loadCoverLine(supabase, tenant_id, id, lineId)
  if (!found) return NextResponse.json({ success: false, error: 'Service booking not found' }, { status: 404 })
  const { line, rateTable, rateId } = found
  if (!CHANGEABLE.includes(normalizeStatus(line.status))) {
    return NextResponse.json({ success: false, error: 'Move the line back to To arrange before changing who covers it' }, { status: 409 })
  }
  const actor = { actorUserId: user?.id ?? null, actorLabel: user?.email ?? null }

  if (body.kind === 'supplier') {
    const supplierId = String(body.supplier_id ?? '')
    const { data: supplier } = await supabase.from('suppliers').select('id, name, company_name').eq('id', supplierId).eq('tenant_id', tenant_id).maybeSingle()
    if (!supplier) return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 })
    const rates = await loadSameServiceRates(supabase, tenant_id, rateTable, rateId)
    const c = alternativeCost(rateTable, line.quoted_cost, rates.pinned, rates.candidates, supplierId, line.service_date)
    const name = ((supplier.name || supplier.company_name) as string).trim()

    const { data: updated, error } = await supabase.from('booking_supplier_status').update({
      supplier_id: supplierId,
      supplier_name: name,
      resource_kind: 'supplier',
      itinerary_resource_id: null,
      // Their cost, or none: the operator enters what they agreed.
      quoted_cost: c.ok ? c.cost : null,
      confirmed_cost: null,
      updated_at: new Date().toISOString(),
    }).eq('id', line.id).eq('booking_id', id).select().single()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    // Another supplier now: the previous one's reply link stops working.
    if (line.supplier_id !== supplierId) {
      const { error: revokeErr } = await supabase.from('service_booking_links').update({ revoked_at: new Date().toISOString() })
        .eq('service_booking_id', line.id).is('revoked_at', null)
      if (revokeErr) console.error('[cover] revoke link:', revokeErr.message)
    }

    const logged = await recordServiceBookingEvent(supabase, {
      tenantId: tenant_id, bookingId: id, serviceBookingId: line.id, actor: 'operator', channel: 'app', ...actor,
      note: `Supplier: ${name}${c.ok ? '' : ` — no cost (${c.reason})`}`,
      details: { supplier_id: supplierId, previous_supplier_id: line.supplier_id, cost: c.ok ? c.cost : null, rate_id: c.ok ? c.rateId : null },
    })
    if (!logged.ok) console.error('[cover] event:', logged.error)
    return NextResponse.json({ success: true, data: updated, no_cost_reason: c.ok ? null : c.reason })
  }

  if (body.kind === 'own') {
    const type = String(body.resource_type ?? '')
    const resourceId = String(body.resource_id ?? '')
    if (!ownResourceTypes(line.supplier_type, rateTable).includes(type)) {
      return NextResponse.json({ success: false, error: 'That kind of resource cannot cover this line' }, { status: 400 })
    }
    const options = await ownOptions(supabase, tenant_id, [type])
    const chosen = options.find(o => o.resource_id === resourceId)
    if (!chosen) return NextResponse.json({ success: false, error: 'Not found in your team or cars' }, { status: 404 })
    if (!line.service_date) return NextResponse.json({ success: false, error: 'The line has no date to assign' }, { status: 400 })

    const { data: booking } = await supabase.from('bookings').select('itinerary_id').eq('id', id).maybeSingle()
    if (!booking?.itinerary_id) return NextResponse.json({ success: false, error: 'The booking has no itinerary' }, { status: 400 })

    // Clash: the same person or car on another trip those days.
    const { data: others } = await supabase.from('itinerary_resources')
      .select('resource_type, resource_id, resource_name, start_date, end_date, itinerary_id, itineraries(itinerary_code)')
      .eq('resource_type', type).eq('resource_id', resourceId).eq('status', 'confirmed').neq('itinerary_id', booking.itinerary_id)
    const clashes = computeConflicts(
      [{ resource_type: type, resource_id: resourceId, resource_name: chosen.name, start_date: line.service_date, end_date: line.service_date }],
      (others ?? []) as never,
    )

    const { data: assignment, error: assignErr } = await supabase.from('itinerary_resources').insert({
      tenant_id, itinerary_id: booking.itinerary_id, resource_type: type, resource_id: resourceId,
      resource_name: chosen.name, start_date: line.service_date, end_date: line.service_date,
      status: 'confirmed', notes: `Covers: ${line.supplier_name}`,
    }).select('id').single()
    if (assignErr || !assignment) return NextResponse.json({ success: false, error: assignErr?.message || 'Could not assign' }, { status: 500 })

    const { error: lineErr } = await supabase.from('booking_supplier_status').update({
      resource_kind: 'own',
      itinerary_resource_id: assignment.id,
      supplier_id: type === 'guide' ? resourceId : null,
      supplier_name: chosen.name,
      assigned_vehicle_id: type === 'vehicle' ? resourceId : null,
      assigned_vehicle_plate: type === 'vehicle' ? chosen.detail : null,
      assigned_guide_name: type === 'guide' ? chosen.name : null,
      updated_at: new Date().toISOString(),
    }).eq('id', line.id).eq('booking_id', id)
    if (lineErr) {
      // Undo the assignment so it does not stand alone.
      const { error: undoErr } = await supabase.from('itinerary_resources').delete().eq('id', assignment.id)
      if (undoErr) console.error('[cover] could not undo the assignment', assignment.id, undoErr.message)
      return NextResponse.json({ success: false, error: lineErr.message }, { status: 500 })
    }

    const moved = await transitionServiceBooking(supabase, tenant_id, {
      id: line.id, bookingId: id, to: 'assigned', actor: 'operator', channel: 'app', ...actor,
      note: `Assigned directly: ${chosen.name}${clashes.length ? ` (also on ${clashes.map(c => c.conflicting_itinerary).join(', ')})` : ''}`,
    })
    if (!moved.ok) return NextResponse.json({ success: false, error: moved.error }, { status: moved.status })
    return NextResponse.json({ success: true, data: moved.row, clashes })
  }

  return NextResponse.json({ success: false, error: "kind must be 'own' or 'supplier'" }, { status: 400 })
}
