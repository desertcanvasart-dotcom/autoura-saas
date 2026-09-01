// ============================================
// /api/tours/variations/[id]/options — priced upgrades of ONE variation
// ============================================
// A hot-air balloon on the Luxor deluxe trip, a private felucca on the Aswan
// standard: upgrades that belong to a programme are authored on its variation
// (migration 319), because a Standard and a Deluxe trip sell different
// upgrades at different prices. Extras that go with ANY quote live in
// /api/extras-catalogue instead. Same money model, same pricing helper.

import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/supabase-server'
import type { Database } from '@/types/database.types'
import { OPTION_COLS, isUnit, optionsTable, pickOptionWritable } from '@/lib/tours/variation-options'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** The variation must be this tenant's — an option can never be attached to
 *  another organisation's programme. */
async function ownVariation(
  supabase: SupabaseClient<Database>,
  variationId: string,
  tenantId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('tour_variations')
    .select('id')
    .eq('id', variationId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return !!data
}

export async function GET(request: NextRequest, { params }: Ctx) {
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

    let query = optionsTable(supabase)
      .select(OPTION_COLS)
      .eq('variation_id', variationId)
      .eq('tenant_id', tenant_id)
      .order('sort_order', { ascending: true })
      .order('name')
    if (request.nextUrl.searchParams.get('active_only') === 'true') {
      query = query.eq('is_active', true)
    }
    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error('GET variation options:', error)
    return NextResponse.json({ success: false, error: 'Failed to load options' }, { status: 500 })
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
    const record = pickOptionWritable(body)
    const name = String(record.name ?? '').trim()
    if (!name) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 })
    }
    if (record.unit !== undefined && !isUnit(record.unit)) {
      return NextResponse.json({ success: false, error: 'Unit must be per_person or per_booking' }, { status: 400 })
    }

    const { data, error } = await optionsTable(supabase)
      .insert({ ...record, name, tenant_id, variation_id: variationId })
      .select(OPTION_COLS)
      .single()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: `An option named "${name}" already exists on this variation` }, { status: 409 })
      }
      throw error
    }
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error('POST variation options:', error)
    return NextResponse.json({ success: false, error: 'Failed to create the option' }, { status: 500 })
  }
}
