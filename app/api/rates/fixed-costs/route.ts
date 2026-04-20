import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// GET - List fixed daily costs
export async function GET() {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const { data, error } = await supabase
      .from('fixed_daily_costs')
      .select('*')
      .order('cost_type')

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
    if (authResult.error) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const body = await request.json()

    const { data, error } = await supabase
      .from('fixed_daily_costs')
      .insert({
        tenant_id,
        cost_type: body.cost_type,
        cost_per_person_per_day: parseFloat(body.cost_per_person_per_day) || 0,
        description: body.description || null,
        is_active: body.is_active !== false,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// PUT - Update fixed cost
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const body = await request.json()
    const { id, ...updateFields } = body
    if (!id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 })

    const updateData: Record<string, any> = {}
    if (updateFields.cost_type !== undefined) updateData.cost_type = updateFields.cost_type
    if (updateFields.cost_per_person_per_day !== undefined) updateData.cost_per_person_per_day = parseFloat(updateFields.cost_per_person_per_day) || 0
    if (updateFields.description !== undefined) updateData.description = updateFields.description || null
    if (updateFields.is_active !== undefined) updateData.is_active = updateFields.is_active

    const { data, error } = await supabase
      .from('fixed_daily_costs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
