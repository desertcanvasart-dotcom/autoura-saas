import { NextResponse } from 'next/server'
import type { Json } from '@/types/database.types'
import { requireAuth } from '@/lib/supabase-server'
import { logActivity } from '@/lib/billing-middleware'
import {
  buildFrozenFx,
  computeFxReprice,
  parseFrozenFx,
  type ServiceLineForFx,
} from '@/lib/itinerary-fx'
import { getTenantRunCurrency } from '@/lib/rates/run-currency'

// ============================================
// POST — explicit, logged FX reprice (P4)
// ============================================
// The ONLY way a confirmed itinerary's supplier-side costs move after the
// confirm-time snapshot. Restates every service line that carries its
// contract amount (supplier_cost_original in supplier_currency) at TODAY'S
// exchange rates, recomputes the header's supplier_cost and profit, and
// re-stamps fx_frozen with source='reprice'. The CLIENT price
// (total_cost / selling_price) never moves — this restates what the trip
// costs, not what the client was quoted.
//
// Lines without a foreign contract currency are untouched; lines that cannot
// be restated (missing original, missing rate) are skipped and reported.

const ADMIN_ROLES = ['owner', 'admin']

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id, role, user } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }
    if (!ADMIN_ROLES.includes(role || '')) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 })
    }

    const { id } = await params

    const { data: itinerary } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (!itinerary) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }

    const row = itinerary as Record<string, unknown>
    if (!('fx_frozen' in row)) {
      return NextResponse.json(
        { success: false, error: 'FX freeze is not available yet (database migration pending)' },
        { status: 409 }
      )
    }
    const frozen = parseFrozenFx(row.fx_frozen)
    if (!frozen) {
      return NextResponse.json(
        { success: false, error: 'Nothing frozen to reprice — the itinerary has not been confirmed under the FX-freeze model' },
        { status: 409 }
      )
    }

    const [{ data: services }, { data: currentRates }] = await Promise.all([
      supabase
        .from('itinerary_services')
        .select('id, supplier_currency, supplier_cost_original, quantity, unit_cost, total_cost')
        .eq('itinerary_id', id),
      supabase
        .from('exchange_rates')
        .select('base_currency, target_currency, rate, is_active')
        .eq('is_active', true),
    ])

    if (!currentRates || currentRates.length === 0) {
      return NextResponse.json({ success: false, error: 'No active exchange rates available' }, { status: 409 })
    }

    const runCurrency = await getTenantRunCurrency(supabase, tenant_id)
    const lines = (services ?? []) as ServiceLineForFx[]
    const result = computeFxReprice(lines, buildFrozenFx(currentRates, null, 'reprice').rates, runCurrency)

    // Apply per-line patches.
    for (const patch of result.patches) {
      const { error } = await supabase
        .from('itinerary_services')
        .update({
          unit_cost: patch.unit_cost,
          total_cost: patch.total_cost,
          exchange_rate_used: patch.exchange_rate_used,
        })
        .eq('id', patch.id)
      if (error) {
        return NextResponse.json({ success: false, error: `Failed updating line ${patch.id}: ${error.message}` }, { status: 500 })
      }
    }

    // Header: supplier_cost = sum of (restated) line costs; profit follows.
    // total_cost is the CLIENT price and is deliberately untouched.
    const patchById = new Map(result.patches.map(p => [p.id, p]))
    const newSupplierCost = lines.reduce((sum, l) => {
      const patched = patchById.get(l.id)
      return sum + (patched ? patched.total_cost : (l.total_cost ?? 0))
    }, 0)
    const clientPrice = typeof row.total_cost === 'number' ? row.total_cost : 0
    const newFrozen = buildFrozenFx(currentRates, user?.id ?? null, 'reprice', undefined, runCurrency)

    const { error: headerError } = await supabase
      .from('itineraries')
      .update({
        supplier_cost: Math.round(newSupplierCost * 100) / 100,
        profit: Math.round((clientPrice - newSupplierCost) * 100) / 100,
        fx_frozen: newFrozen as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (headerError) {
      return NextResponse.json({ success: false, error: headerError.message }, { status: 500 })
    }

    await logActivity(tenant_id, user?.id ?? '', 'fx_reprice', supabase, {
      resourceType: 'itinerary',
      resourceId: id,
      details: {
        lines_repriced: result.patches.length,
        lines_skipped: result.skipped,
        lines_untouched: result.untouched,
        previous_frozen_at: frozen.frozen_at,
        previous_source: frozen.source,
        new_supplier_cost: Math.round(newSupplierCost * 100) / 100,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        repriced: result.patches.length,
        skipped: result.skipped,
        untouched: result.untouched,
        supplier_cost: Math.round(newSupplierCost * 100) / 100,
        frozen_at: newFrozen.frozen_at,
      },
    })
  } catch (error) {
    console.error('reprice-fx error:', error)
    return NextResponse.json({ success: false, error: 'Reprice failed' }, { status: 500 })
  }
}
