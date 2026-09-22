import { NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { propertyFromService, propertyRateStatus, type PropertyRateStatus } from '@/lib/itineraries/overnight-property'

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

    // Every hotel and ship name in THIS agency's rates (RLS scopes the read),
    // for the "no longer in your rates" warning on a night whose property was
    // deleted or switched off after the itinerary was priced. Small tables.
    // A catalogue that failed to load says nothing about its properties: the
    // status is withheld for that kind, never reported as "not in your rates".
    const [{ data: hotelRows, error: hotelError }, { data: shipRows, error: shipError }] = await Promise.all([
      supabase.from('accommodation_rates').select('property_name, is_active'),
      supabase.from('nile_cruises').select('ship_name, is_active'),
    ])
    if (hotelError || shipError) console.warn('[days-api] rates catalogue partly unavailable; overnight status withheld', hotelError?.message ?? shipError?.message)
    const loadedFor = { hotel: !hotelError, cruise: !shipError }
    const catalog = {
      hotels: (hotelRows ?? []).map(r => ({ name: r.property_name, active: r.is_active })),
      ships: (shipRows ?? []).map(r => ({ name: r.ship_name, active: r.is_active })),
    }

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
          // Staff-only: whether the night's hotel or ship is still in Rates.
          services: (services || []).map(service => ({
            ...service,
            property_rate_status: ((): PropertyRateStatus | null => {
              const property = propertyFromService(service as never)
              return property && loadedFor[property.kind] ? propertyRateStatus(property, catalog) : null
            })(),
          }))
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