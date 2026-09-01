// PUT/DELETE one variation option. Scoped by tenant AND variation as well as
// id, so an option can never be edited across organisations or programmes.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { OPTION_COLS, isUnit, optionsTable, pickOptionWritable } from '@/lib/tours/variation-options'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; optionId: string }> }

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }
    const { id: variationId, optionId } = await params

    const body = await request.json()
    const record = pickOptionWritable(body)
    if ('name' in record) {
      record.name = String(record.name ?? '').trim()
      if (!record.name) return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 })
    }
    if (record.unit !== undefined && !isUnit(record.unit)) {
      return NextResponse.json({ success: false, error: 'Unit must be per_person or per_booking' }, { status: 400 })
    }
    record.updated_at = new Date().toISOString()

    const { data, error } = await optionsTable(supabase)
      .update(record)
      .eq('id', optionId)
      .eq('variation_id', variationId)
      .eq('tenant_id', tenant_id)
      .select(OPTION_COLS)
      .maybeSingle()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: 'An option with that name already exists on this variation' }, { status: 409 })
      }
      throw error
    }
    if (!data) return NextResponse.json({ success: false, error: 'Option not found' }, { status: 404 })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('PUT variation option:', error)
    return NextResponse.json({ success: false, error: 'Failed to save the option' }, { status: 500 })
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
    const { id: variationId, optionId } = await params

    // A quote that already included this option keeps its own line in
    // services_snapshot, so deleting the option cannot rewrite history — it
    // only stops the option being offered on new quotes.
    const { data, error } = await optionsTable(supabase)
      .delete()
      .eq('id', optionId)
      .eq('variation_id', variationId)
      .eq('tenant_id', tenant_id)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ success: false, error: 'Option not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE variation option:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete the option' }, { status: 500 })
  }
}
