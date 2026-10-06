// ============================================
// A Pricing Grid save's overnight cities
// ============================================
// The grid has one city per day — where the day is SPENT. The save used to
// store it as the night's city too, so a day trip to Alexandria from a Cairo
// hotel said "Overnight in Alexandria". The night is where its bed is: the
// accommodation picked that day (its city in Rates) or the cruise (on board),
// resolved by the shared rule (overnight-city.ts).

import { resolveComponents } from '@/app/pricing-grid/lib/grid-completeness'
import type { GridDay } from '@/app/pricing-grid/types'
import { resolveOvernightCities } from './overnight-city'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The rate row a slot's night is booked from: its first item, when it is a real row id. */
function bookedRateId(day: GridDay, slotId: 'accommodation' | 'cruise'): string | null {
  const id = day.slots?.find(s => s.slotId === slotId)?.selectedItems?.[0]?.rateId
  return typeof id === 'string' && UUID_RE.test(id) ? id : null
}

export interface StayLookup {
  /** accommodation_rates id → its city. */
  hotelCity: Map<string, string | null>
  /** nile_cruises id → its ship. */
  cruiseShip: Map<string, string | null>
}

/** Each day's overnight city, by day number. Pure — the save supplies the lookups. */
export function overnightCitiesFor(days: readonly GridDay[], stays: StayLookup): Map<number, string | null> {
  const ordered = [...days].sort((a, b) => a.dayNumber - b.dayNumber)
  const cities = resolveOvernightCities(ordered.map(day => {
    // The day type's own night, not the package's: a tours-only package
    // sells no hotel, but the traveller still sleeps somewhere.
    const parts = resolveComponents(day)
    const hotel = bookedRateId(day, 'accommodation')
    const cruise = bookedRateId(day, 'cruise')
    return {
      city: day.city,
      overnight: parts.overnight,
      intercity: parts.intercity,
      propertyCity: hotel ? stays.hotelCity.get(hotel) ?? null : null,
      cruiseShip: cruise ? stays.cruiseShip.get(cruise) ?? null : null,
    }
  }))
  return new Map(ordered.map((day, i) => [day.dayNumber, cities[i]]))
}

interface RateReader {
  from(table: string): {
    select(columns: string): {
      in(column: string, values: string[]): PromiseLike<{ data: Array<Record<string, unknown>> | null; error: unknown }>
    }
  }
}

/** Looks the booked hotels and ships up, then resolves every night. */
export async function gridOvernightCities(db: RateReader, days: readonly GridDay[]): Promise<Map<number, string | null>> {
  const hotelIds = [...new Set(days.map(d => bookedRateId(d, 'accommodation')).filter((x): x is string => !!x))]
  const cruiseIds = [...new Set(days.map(d => bookedRateId(d, 'cruise')).filter((x): x is string => !!x))]
  const [hotels, cruises] = await Promise.all([
    hotelIds.length ? db.from('accommodation_rates').select('id, city').in('id', hotelIds) : { data: [] },
    cruiseIds.length ? db.from('nile_cruises').select('id, ship_name').in('id', cruiseIds) : { data: [] },
  ])
  // A failed lookup leaves the night to the rest of the rule — never a guess.
  const stays: StayLookup = {
    hotelCity: new Map((hotels.data ?? []).map(r => [String(r.id), (r.city as string | null) ?? null])),
    cruiseShip: new Map((cruises.data ?? []).map(r => [String(r.id), (r.ship_name as string | null) ?? null])),
  }
  return overnightCitiesFor(days, stays)
}
