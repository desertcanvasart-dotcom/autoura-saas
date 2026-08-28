// ============================================
// POST /api/itineraries/[id]/generate-commissions  (C2 rewrite)
// ============================================
// Thin shell over lib/commission-generation.ts — the direction-aware engine:
// receivable = a share of the supplier's own price, payable = a share of OUR
// PROFIT on the service, plus a second payable commission for a named seller
// (sold_by_supplier_id). The previous math here computed everything off
// `selling_price || cost` — the CLIENT price first, regardless of direction —
// which over-claimed against every supplier by the size of our markup.
//
// Skips are reported per service with reasons: a correct run over unpriced
// services yields zero rows, and that must be distinguishable from a broken
// run.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import {
  buildCommissions,
  summariseSkips,
  type CommissionSourceService,
  type CommissionSupplier,
} from '@/lib/commission-generation'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    }
    const { id: itineraryId } = await params

    const { data: itinerary, error: itinError } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', itineraryId)
      .single()
    if (itinError || !itinerary) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }

    // select('*') everywhere: sold_by_supplier_id (migration 303) must ride
    // along when it exists without 500ing when it does not.
    const { data: services, error: servicesError } = await supabase
      .from('itinerary_services')
      .select('*')
      .eq('itinerary_id', itineraryId)
    if (servicesError) {
      return NextResponse.json({ success: false, error: 'Failed to fetch services' }, { status: 500 })
    }

    const rows = (services ?? []) as Array<Record<string, unknown>>
    const withParty = rows.filter(s => s.supplier_id || s.sold_by_supplier_id)
    if (withParty.length === 0) {
      return NextResponse.json({ success: true, message: 'No services with a supplier', generated: 0, skipped: [] })
    }

    // No FK from itinerary_services to suppliers — fetch the parties separately.
    const partyIds = [
      ...new Set(
        withParty
          .flatMap(s => [s.supplier_id, s.sold_by_supplier_id])
          .filter((v): v is string => typeof v === 'string')
      ),
    ]
    const { data: suppliers, error: suppliersError } = await supabase
      .from('suppliers')
      .select('id, name, default_commission_rate, commission_type')
      .in('id', partyIds)
    if (suppliersError) {
      return NextResponse.json({ success: false, error: 'Failed to fetch suppliers' }, { status: 500 })
    }
    const supplierById = new Map<string, CommissionSupplier>(
      (suppliers ?? []).map(sup => [sup.id, sup as CommissionSupplier])
    )

    const sources: CommissionSourceService[] = withParty.map(s => ({
      id: s.id as string,
      service_type: (s.service_type as string) ?? null,
      service_name: (s.service_name as string) ?? null,
      client_price: (s.client_price as number) ?? (s.selling_price as number) ?? null,
      total_cost: (s.total_cost as number) ?? null,
      supplier_id: (s.supplier_id as string) ?? null,
      commission_rate: (s.commission_rate as number) ?? null,
      commission_status: (s.commission_status as string) ?? null,
      supplier: s.supplier_id ? supplierById.get(s.supplier_id as string) ?? null : null,
      sold_by_supplier_id: (s.sold_by_supplier_id as string) ?? null,
      seller: s.sold_by_supplier_id ? supplierById.get(s.sold_by_supplier_id as string) ?? null : null,
    }))

    const { pairs, skipped } = buildCommissions(sources, {
      tenantId: tenant_id,
      itineraryId,
      itineraryCode: (itinerary.itinerary_code as string) || itineraryId.slice(0, 8),
      clientId: itinerary.client_id,
      startDate: itinerary.start_date,
      currency: itinerary.currency,
    })

    if (pairs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No commissions to generate',
        generated: 0,
        skipped,
        skip_summary: summariseSkips(skipped),
      })
    }

    // Insert. cost_amount is migration 303; on a database without it,
    // PostgREST rejects the column by name — strip it and retry so deploy
    // and migration can land in either order.
    let toInsert = pairs.map(p => ({ ...p.commission })) as Array<Record<string, unknown>>
    let { data: created, error: createError } = await supabase
      .from('commissions')
      .insert(toInsert as never)
      .select('id')
    if (createError && /cost_amount/.test(createError.message)) {
      toInsert = toInsert.map(row => Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'cost_amount')))
      ;({ data: created, error: createError } = await supabase
        .from('commissions')
        .insert(toInsert as never)
        .select('id'))
    }
    if (createError) {
      console.error('Error creating commissions:', createError)
      return NextResponse.json({ success: false, error: 'Failed to create commissions' }, { status: 500 })
    }

    // Claim exactly the services that produced a row — BY ID from the pairs,
    // never by re-running a filter that could drift from the engine's.
    const claimedIds = [...new Set(pairs.map(p => p.serviceId))]
    await supabase
      .from('itinerary_services')
      .update({ commission_status: 'generated' })
      .in('id', claimedIds)

    return NextResponse.json({
      success: true,
      message: `Generated ${created?.length ?? pairs.length} commission record(s)`,
      generated: created?.length ?? pairs.length,
      skipped,
      skip_summary: summariseSkips(skipped),
    })
  } catch (error) {
    console.error('Error generating commissions:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
