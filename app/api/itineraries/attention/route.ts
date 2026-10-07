import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { loadTripPnls } from '@/lib/trip-pnl-load'
import type { PnlItinerary } from '@/lib/trip-pnl'
import { buildTripAttention, type AttentionDay, type AttentionService } from '@/lib/itineraries/attention'
import type { CoverageAssignment } from '@/lib/itineraries/coverage'
import { propertyFromService, propertyRateStatus } from '@/lib/itineraries/overnight-property'
import { cruiseSailingNotes, type CruiseShip } from '@/lib/rates/cruise-sailing'

// ============================================
// GET /api/itineraries/attention?today=YYYY-MM-DD
// ============================================
// How many things need attention on each open trip — for the itineraries
// list. Built by the same function the itinerary page uses
// (lib/itineraries/attention), from the same kinds of rows, so the count in
// the list is the list the trip shows when opened. Cancelled and completed
// trips are left out: there is nothing left to act on.
//
// Reads are batched over the trips (ids in chunks, rows in pages — PostgREST
// returns at most 1000 rows per request, and a silently cut list would make
// counts quietly wrong).

const ID_CHUNK = 150
const PAGE = 1000

type Rows<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/** Every row for these ids: chunked by id, paged by row. */
async function readAll<T>(ids: string[], query: (chunk: string[], from: number, to: number) => Rows<T>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK)
    // Until a page comes back empty — not "shorter than asked", since the
    // server's row cap may be below PAGE.
    for (let from = 0; ;) {
      const { data, error } = await query(chunk, from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) break
      out.push(...data)
      from += data.length
    }
  }
  return out
}

const isDay = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) {
    return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
  }
  const asked = request.nextUrl.searchParams.get('today')
  const today = isDay(asked) ? asked! : new Date().toISOString().slice(0, 10)

  try {
    const { data: trips, error: tripsError } = await supabase
      .from('itineraries')
      .select('id, itinerary_code, trip_name, client_name, start_date, end_date, status, currency, total_cost, margin_percent')
      .not('status', 'in', '(cancelled,completed)')
    if (tripsError) throw new Error(tripsError.message)
    const itineraries = (trips ?? []) as Array<PnlItinerary & { margin_percent: number | null }>
    if (itineraries.length === 0) return NextResponse.json({ success: true, data: {} })
    const ids = itineraries.map(t => t.id)

    const [bookings, days, services, resources, hotels, ships, tenant, pnls] = await Promise.all([
      readAll<{ itinerary_id: string | null }>(ids, (c, a, b) =>
        supabase.from('bookings').select('itinerary_id').in('itinerary_id', c).range(a, b)),
      readAll<{ id: string; itinerary_id: string; day_number: number; date: string | null; accommodation_type: string | null; is_cruise_day: boolean | null }>(ids, (c, a, b) =>
        supabase.from('itinerary_days').select('id, itinerary_id, day_number, date, accommodation_type, is_cruise_day').in('itinerary_id', c).order('id').range(a, b)),
      readAll<AttentionService & { itinerary_id: string | null; itinerary_day_id: string | null; rate_table: string | null; rate_id: string | null }>(ids, (c, a, b) =>
        supabase.from('itinerary_services')
          .select('itinerary_id, itinerary_day_id, service_type, service_name, description, supplier_name, total_cost, client_price, rate_table, rate_id')
          .in('itinerary_id', c).order('id').range(a, b)),
      // Assignments that fail to load call nothing missing (null), as on the page.
      readAll<CoverageAssignment & { itinerary_id: string }>(ids, (c, a, b) =>
        supabase.from('itinerary_resources')
          .select('id, itinerary_id, resource_type, resource_name, itinerary_day_id, start_date, end_date, status')
          .in('itinerary_id', c).order('id').range(a, b)).catch(() => null),
      // The rates catalogue, as the days API reads it; a kind that fails to load is not judged.
      supabase.from('accommodation_rates').select('property_name, is_active'),
      supabase.from('nile_cruises').select('id, ship_name, sailing_days, is_active'),
      supabase.from('tenants').select('min_margin_percent').eq('id', tenant_id).maybeSingle(),
      loadTripPnls(supabase, itineraries, null),
    ])

    const loadedFor = { hotel: !hotels.error, cruise: !ships.error }
    const catalog = {
      hotels: (hotels.data ?? []).map(r => ({ name: r.property_name, active: r.is_active })),
      ships: (ships.data ?? []).map(r => ({ name: r.ship_name, active: r.is_active })),
    }
    const shipById = new Map<string, CruiseShip>((ships.data ?? []).map(s => [s.id, { ship_name: s.ship_name, sailing_days: s.sailing_days }]))
    // Before migration 399 the column is not there: no minimum.
    const minMargin = tenant.error ? null : ((tenant.data as { min_margin_percent?: number | null } | null)?.min_margin_percent ?? null)

    const booked = new Set(bookings.map(b => b.itinerary_id).filter(Boolean))
    const pnlById = new Map(pnls.pnlData.map(p => [p.itinerary_id, p]))
    const servicesByDay = new Map<string, typeof services>()
    for (const s of services) {
      if (!s.itinerary_day_id) continue
      const list = servicesByDay.get(s.itinerary_day_id) ?? []
      list.push(s)
      servicesByDay.set(s.itinerary_day_id, list)
    }
    const daysByTrip = new Map<string, typeof days>()
    for (const d of days) {
      const list = daysByTrip.get(d.itinerary_id) ?? []
      list.push(d)
      daysByTrip.set(d.itinerary_id, list)
    }
    const resourcesByTrip = new Map<string, CoverageAssignment[]>()
    for (const r of resources ?? []) {
      const list = resourcesByTrip.get(r.itinerary_id) ?? []
      list.push(r)
      resourcesByTrip.set(r.itinerary_id, list)
    }

    const data: Record<string, { count: number; warnings: number; items: string[] }> = {}
    for (const trip of itineraries) {
      const tripDays = (daysByTrip.get(trip.id) ?? []).sort((a, b) => a.day_number - b.day_number)
      const withServices: AttentionDay[] = tripDays.map(d => ({
        id: d.id,
        day_number: d.day_number,
        date: d.date,
        services: (servicesByDay.get(d.id) ?? []).map(s => {
          const property = propertyFromService(s as never)
          return { ...s, property_rate_status: property && loadedFor[property.kind] ? propertyRateStatus(property, catalog) : null }
        }),
      }))
      const cruiseNotes = loadedFor.cruise
        ? cruiseSailingNotes(tripDays.map(d => ({ ...d, itinerary_services: servicesByDay.get(d.id) ?? [] })), shipById)
        : []
      const pnl = pnlById.get(trip.id) ?? null
      const { attention } = buildTripAttention({
        itinerary: trip,
        today,
        hasBooking: booked.has(trip.id),
        hasInvoice: !!pnl && pnl.invoice_count > 0,
        pnl,
        days: withServices,
        assignments: resources ? resourcesByTrip.get(trip.id) ?? [] : null,
        cruiseNotes,
        minMarginPercent: minMargin,
      })
      if (attention.length > 0) {
        data[trip.id] = {
          count: attention.length,
          warnings: attention.filter(a => a.severity === 'warning').length,
          items: attention.map(a => a.message),
        }
      }
    }
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in itineraries attention GET:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
