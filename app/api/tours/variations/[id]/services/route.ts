// ============================================
// /api/tours/variations/[id]/services — the service lines of ONE variation
// ============================================
// Mirrors travel-ops-pro's route of the same path (minus its bulk-replace PUT
// and rate-detail enrichment, which nothing here needs yet), so the two apps
// author a variation's services — and therefore its priced OPTIONS — the same
// way: an option is a service row with is_optional = TRUE, a cost in
// cost_per_unit and, when the operator has decided one, optional_price_override.
// See lib/b2b/optional-pricing.ts for how the quote engine prices those.
//
// Scoped by tenant AND variation on every write: a service id alone must not
// be enough to edit a service on another programme.

import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/supabase-server'
import type { Database } from '@/types/database.types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const SERVICE_COLS =
  'id, tenant_id, variation_id, service_name, service_category, rate_type, rate_id, quantity_mode, quantity_value, cost_per_unit, day_number, sequence_order, is_optional, optional_price_override, notes, created_at'

// PATCH allow-list. `variation_id` is deliberately absent: moving a service to
// another programme by PATCH would be a quiet re-parenting nobody asked for.
const EDITABLE_SERVICE_FIELDS = [
  'service_name',
  'service_category',
  'quantity_mode',
  'quantity_value',
  'cost_per_unit',
  'day_number',
  'is_optional',
  'optional_price_override',
  'notes',
  'sequence_order',
] as const

const MONEY_FIELDS = ['cost_per_unit', 'optional_price_override'] as const

/** A blank money field means "not priced", never 0 — the unpriced-rates rule. */
function numberOrNull(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function ownVariation(supabase: SupabaseClient<Database>, variationId: string, tenantId: string) {
  const { data } = await supabase
    .from('tour_variations')
    .select('id')
    .eq('id', variationId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return !!data
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }
    const { id: variationId } = await params
    if (!(await ownVariation(supabase, variationId, tenant_id))) {
      return NextResponse.json({ success: false, error: 'Variation not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('tour_variation_services')
      .select(SERVICE_COLS)
      .eq('variation_id', variationId)
      .eq('tenant_id', tenant_id)
      .order('sequence_order', { ascending: true })
    if (error) throw error
    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error('GET variation services:', error)
    return NextResponse.json({ success: false, error: 'Failed to load services' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }
    const { id: variationId } = await params
    if (!(await ownVariation(supabase, variationId, tenant_id))) {
      return NextResponse.json({ success: false, error: 'Variation not found' }, { status: 404 })
    }

    const body = await request.json()
    const service_name = String(body.service_name ?? '').trim()
    if (!service_name) {
      return NextResponse.json({ success: false, error: 'A service name is required' }, { status: 400 })
    }
    const cost_per_unit = numberOrNull(body.cost_per_unit)
    const optional_price_override = numberOrNull(body.optional_price_override)
    if ((cost_per_unit ?? 0) < 0 || (optional_price_override ?? 0) < 0) {
      return NextResponse.json({ success: false, error: 'Money fields cannot be negative' }, { status: 400 })
    }

    const { data: last } = await supabase
      .from('tour_variation_services')
      .select('sequence_order')
      .eq('variation_id', variationId)
      .order('sequence_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextOrder = (last?.sequence_order || 0) + 1

    const { data, error } = await supabase
      .from('tour_variation_services')
      .insert({
        tenant_id,
        variation_id: variationId,
        service_name,
        service_category: body.service_category ?? null,
        rate_type: body.rate_type ?? null,
        rate_id: body.rate_id ?? null,
        quantity_mode: body.quantity_mode || 'per_pax',
        quantity_value: Number(body.quantity_value) || 1,
        cost_per_unit,
        day_number: numberOrNull(body.day_number),
        is_optional: body.is_optional === true,
        optional_price_override,
        notes: body.notes ?? null,
        sequence_order: Number(body.sequence_order) || nextOrder,
      })
      .select(SERVICE_COLS)
      .single()
    if (error) throw error
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error('POST variation service:', error)
    return NextResponse.json({ success: false, error: 'Failed to create the service' }, { status: 500 })
  }
}

// PATCH — change ONE service on this variation. The shape a person editing a
// price needs, as opposed to an importer replacing every row.
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }
    const { id: variationId } = await params

    const body = await request.json().catch(() => ({}))
    const serviceId = typeof body?.serviceId === 'string' ? body.serviceId : null
    if (!serviceId) {
      return NextResponse.json({ success: false, error: 'serviceId is required' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    for (const field of EDITABLE_SERVICE_FIELDS) {
      if (body[field] === undefined) continue
      updates[field] = body[field] === '' ? null : body[field]
    }
    if (typeof updates.service_name === 'string' && !updates.service_name.trim()) {
      return NextResponse.json({ success: false, error: 'A service name is required' }, { status: 400 })
    }
    // A blank price is "no price of its own" — a real state, the option falls
    // back to cost + margin. A NEGATIVE one is not.
    for (const money of MONEY_FIELDS) {
      if (updates[money] != null && Number(updates[money]) < 0) {
        return NextResponse.json({ success: false, error: `${money} cannot be negative` }, { status: 400 })
      }
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to change' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('tour_variation_services')
      .update(updates)
      .eq('id', serviceId)
      .eq('variation_id', variationId)
      .eq('tenant_id', tenant_id)
      .select(SERVICE_COLS)
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ success: false, error: 'Service not found on this variation' }, { status: 404 })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('PATCH variation service:', error)
    return NextResponse.json({ success: false, error: 'Failed to save the service' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }
    const { id: variationId } = await params
    const serviceId = request.nextUrl.searchParams.get('serviceId')
    if (!serviceId) {
      return NextResponse.json({ success: false, error: 'serviceId is required' }, { status: 400 })
    }

    // A quote that already chose this option keeps its own line in
    // services_snapshot, so deleting the service cannot rewrite history.
    const { data, error } = await supabase
      .from('tour_variation_services')
      .delete()
      .eq('id', serviceId)
      .eq('variation_id', variationId)
      .eq('tenant_id', tenant_id)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ success: false, error: 'Service not found on this variation' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE variation service:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete the service' }, { status: 500 })
  }
}
