import { NextRequest, NextResponse } from 'next/server'
import { rateCurrencyWriteField } from '@/lib/rates/rate-currency'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { clearFixedCostsCache } from '@/lib/fixed-costs'
import { fetchAllPages } from '@/lib/db/fetch-all-pages'

// GET - List fixed daily costs
export async function GET() {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    // Every page: PostgREST stops a plain select at 1000 rows without an
    // error, so rows past that could not be found to edit or deactivate.
    // `id` last keeps the paging stable between pages.
    const { data, error } = await fetchAllPages((from, to) =>
      supabase
        .from('fixed_daily_costs')
        .select('*')
        .order('cost_type')
        .order('id')
        .range(from, to),
    )

    if (error) {
      // Table may not exist
      return NextResponse.json({ success: true, data: [] })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// POST - Create fixed cost
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    // Rates and suppliers are the managers' area (the sidebar's Suppliers &
    // Rates group); RLS checks only the tenant, so the role is checked here.
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const body = await request.json()

    const { data, error } = await supabase
      .from('fixed_daily_costs')
      .insert({
        ...rateCurrencyWriteField(body),
        tenant_id,
        cost_type: body.cost_type,
        cost_per_person_per_day: parseFloat(body.cost_per_person_per_day) || 0,
        description: body.description || null,
        is_active: body.is_active !== false,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    clearFixedCostsCache()
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// PUT - Update fixed cost
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    // Rates and suppliers are the managers' area (the sidebar's Suppliers &
    // Rates group); RLS checks only the tenant, so the role is checked here.
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied
    const { supabase, tenant_id } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const body = await request.json()
    const { id, ...updateFields } = body
    if (!id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 })

    const updateData: Record<string, any> = {}
    Object.assign(updateData, rateCurrencyWriteField(updateFields))
    if (updateFields.cost_type !== undefined) updateData.cost_type = updateFields.cost_type
    if (updateFields.cost_per_person_per_day !== undefined) updateData.cost_per_person_per_day = parseFloat(updateFields.cost_per_person_per_day) || 0
    if (updateFields.description !== undefined) updateData.description = updateFields.description || null
    if (updateFields.is_active !== undefined) updateData.is_active = updateFields.is_active

    const { data, error } = await supabase
      .from('fixed_daily_costs')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .select()
      .maybeSingle()

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    // The shared default (tenant_id null) matches nothing here: say so, rather
    // than the 500 .single() gave on zero rows.
    if (!data) return NextResponse.json({ success: false, error: 'That cost is the shared default — add your own cost of the same type instead.' }, { status: 404 })
    clearFixedCostsCache()
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// P6: the page had no way to remove a cost at all — an obsolete fixed cost
// could only be edited into irrelevance. Hard delete after an explicit
// confirm in the UI; the engine caches clear so pricing reflects it at once.
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    // Rates and suppliers are the managers' area (the sidebar's Suppliers &
    // Rates group); RLS checks only the tenant, so the role is checked here.
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied
    const { supabase, tenant_id } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const id = body?.id
    if (!id || typeof id !== 'string') return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 })

    const { data: removed, error } = await supabase
      .from('fixed_daily_costs')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .select('id')
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    // Nothing removed (the shared default, or another agency's row) is not a success.
    if (!removed || removed.length === 0) return NextResponse.json({ success: false, error: 'That cost is not yours to delete.' }, { status: 404 })
    clearFixedCostsCache()
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Delete failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
