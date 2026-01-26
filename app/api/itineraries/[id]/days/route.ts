import { NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Use authenticated client - RLS will filter by tenant
    const supabase = await createAuthenticatedClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { id } = await params

    // Fetch all days for this itinerary - RLS ensures tenant isolation
    const { data: days, error: daysError } = await supabase
      .from('itinerary_days')
      .select('*')
      .eq('itinerary_id', id)  // ← CHANGE: params.id → id
      .order('day_number', { ascending: true })

    if (daysError) throw daysError

    // Fetch services for each day
    const daysWithServices = await Promise.all(
      (days || []).map(async (day) => {
        const { data: services, error: servicesError } = await supabase
          .from('itinerary_services')
          .select('*')
          .eq('itinerary_day_id', day.id)
          .order('created_at', { ascending: true })

        if (servicesError) {
          console.error('Error fetching services for day:', servicesError)
        }

        return {
          ...day,
          services: services || []
        }
      })
    )

    return NextResponse.json({
      success: true,
      data: daysWithServices
    })
  } catch (error) {
    console.error('Error fetching itinerary days:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch itinerary days',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}