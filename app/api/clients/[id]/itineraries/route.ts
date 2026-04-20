import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// GET /api/clients/[id]/itineraries
// List all itineraries for a specific client (tenant-aware via RLS)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    }

    const { id } = await params

    const { data, error } = await supabase
      .from('itineraries')
      .select('id, itinerary_code, trip_name, status, start_date, end_date, num_adults, num_children, total_cost, selling_price, currency, tier, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching client itineraries:', error)
      return NextResponse.json({ success: false, data: [], error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('Error in GET /api/clients/[id]/itineraries:', error)
    return NextResponse.json({ success: false, data: [], error: 'Internal server error' }, { status: 500 })
  }
}
