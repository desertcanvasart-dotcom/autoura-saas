import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { fetchAllPages } from '@/lib/db/fetch-all-pages'

export async function GET(request: NextRequest) {
  try {


    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { tenant_id } = authResult
    const adminClient = createAdminClient()

    // Get query parameters for filtering
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const client_id = searchParams.get('client_id')
    const partner_id = searchParams.get('partner_id')
    const quote_type = searchParams.get('quote_type')
    const start_date_from = searchParams.get('start_date_from')
    const start_date_to = searchParams.get('start_date_to')

    // Every page: PostgREST stops a plain select at 1000 rows without an
    // error, so an agency past 1000 bookings lost its oldest ones.
    const { data: bookings, error } = await fetchAllPages((from, to) => {
      // Build query
      let query = adminClient
        .from('bookings')
        .select(`
          *,
          itineraries (
            id,
            itinerary_code,
            trip_name,
            client_name
          ),
          clients (
            id,
            full_name,
            email,
            phone,
            whatsapp
          ),
          b2b_partners (
            id,
            company_name,
            email
          )
        `)
        .eq('tenant_id', tenant_id)

      // Apply filters
      if (status) query = query.eq('status', status)
      if (client_id) query = query.eq('client_id', client_id)
      if (partner_id) query = query.eq('partner_id', partner_id)
      if (quote_type) query = query.eq('quote_type', quote_type)
      if (start_date_from) query = query.gte('start_date', start_date_from)
      if (start_date_to) query = query.lte('start_date', start_date_to)

      // Order by booking date descending; `id` last keeps paging stable
      return query.order('booking_date', { ascending: false }).order('id').range(from, to)
    })

    if (error) {
      console.error('❌ Error fetching bookings:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch bookings' },
        { status: 500 }
      )
    }



    return NextResponse.json({
      success: true,
      data: bookings
    })
  } catch (error: any) {
    console.error('❌ Error in bookings GET:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
