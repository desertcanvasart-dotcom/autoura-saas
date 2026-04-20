import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

const ALLOWED_TABLES = [
  'accommodation_rates', 'transportation_rates', 'guide_rates', 'meal_rates',
  'entrance_fees', 'flight_rates', 'activity_rates', 'tipping_rates',
  'airport_staff_rates', 'hotel_staff_rates', 'nile_cruises', 'train_rates', 'sleeping_train_rates',
]

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const tableName = searchParams.get('table_name')
    const recordId = searchParams.get('record_id')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!tableName) return NextResponse.json({ success: false, error: 'table_name is required' }, { status: 400 })
    if (!ALLOWED_TABLES.includes(tableName)) return NextResponse.json({ success: false, error: `Invalid table_name` }, { status: 400 })

    let query = supabase
      .from('rate_audit_log')
      .select('*', { count: 'exact' })
      .eq('table_name', tableName)
      .order('changed_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (recordId) query = query.eq('record_id', recordId)

    const { data, error, count } = await query

    if (error) {
      // Table may not exist
      return NextResponse.json({ success: true, data: [], total: 0, limit, offset })
    }

    return NextResponse.json({ success: true, data: data || [], total: count || 0, limit, offset })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
