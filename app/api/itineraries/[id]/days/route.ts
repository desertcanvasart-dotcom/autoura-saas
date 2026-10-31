import { NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { fetchAllPages } from '@/lib/db/fetch-all-pages'
import { propertyFromService, propertyRateStatus, type PropertyRateStatus, type RatePin } from '@/lib/itineraries/overnight-property'

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
    // deleted or switched off after the itinerary was priced. Every page:
    // a plain select stops at 1000 rows, and a hotel past that read as
    // "no longer in your rates". The names are matched too (not only pinned
    // ids), so the whole catalogue is read, not just the pinned rows.
    // A catalogue that failed to load says nothing about its properties: the
    // status is withheld for that kind, never reported as "not in your rates".
    const [{ data: hotelRows, error: hotelError }, { data: shipRows, error: shipError }] = await Promise.all([
      fetchAllPages((from, to) =>
        supabase.from('accommodation_rates').select('id, property_name, city, is_active').order('id').range(from, to)),
      fetchAllPages((from, to) =>
        supabase.from('nile_cruises').select('id, ship_name, is_active').order('id').range(from, to)),
    ])
    if (hotelError || shipError) console.warn('[days-api] rates catalogue partly unavailable; overnight status withheld', hotelError?.message ?? shipError?.message)
    const loadedFor = { hotel: !hotelError, cruise: !shipError }
    const catalog = {
      hotels: (hotelRows ?? []).map(r => ({ id: r.id, name: r.property_name, city: r.city, active: r.is_active })),
      ships: (shipRows ?? []).map(r => ({ id: r.id, name: r.ship_name, active: r.is_active })),
    }

    // Every day's services in one read, grouped by day in memory (was one
    // query per day). Same order as before: oldest line first. A failed read
    // fails the request — it used to show the day with no services at all.
    const dayIds = (days || []).map(day => day.id)
    const { data: allServices, error: servicesError } = dayIds.length === 0
      ? { data: [], error: null }
      : await fetchAllPages((from, to) =>
          supabase
            .from('itinerary_services')
            .select('*')
            .in('itinerary_day_id', dayIds)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to))
    if (servicesError) throw servicesError

    const servicesByDay = new Map<string, typeof allServices>()
    for (const service of allServices) {
      const key = String(service.itinerary_day_id)
      const list = servicesByDay.get(key)
      if (list) list.push(service)
      else servicesByDay.set(key, [service])
    }

    const daysWithServices = (days || []).map(day => ({
      ...day,
      // Staff-only: whether the night's hotel or ship is still in Rates.
      services: (servicesByDay.get(String(day.id)) || []).map(service => ({
        ...service,
        property_rate_status: ((): PropertyRateStatus | null => {
          const property = propertyFromService(service as never)
          return property && loadedFor[property.kind] ? propertyRateStatus(property, catalog, service as RatePin) : null
        })(),
      })),
    }))

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