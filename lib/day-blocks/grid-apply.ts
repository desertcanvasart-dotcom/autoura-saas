// ============================================
// A day block, laid onto a Pricing Grid day
// ============================================
// "Insert block" in the Grid: the day takes the block's title, city,
// description and day type, and its services are picked from the agency's
// own rate lists — the same options the Grid's dropdowns offer — by fixed
// rules, never by guessing:
//
//   · entrance fees — each paid attraction, as the library already resolved
//                     it (aliases → fee name), matched to the fee option of
//                     that name, the block's city first;
//   · guide         — a guide rate in the block's city (an assistant or a
//                     spot guide only where a rate says so);
//   · meals         — lunch / dinner the block includes, at a restaurant in
//                     its city (a meal on the ship, at the camp or at the
//                     hotel is part of that night, not a meal line);
//   · transport     — a day tour in the city, or — when the day's hotel is
//                     in another city — the Intercity Day Trip there and
//                     back; a road drop-off from the city to the next; a
//                     flight between them, with the airport transfers at
//                     both ends; the airport transfer of an arrival or a
//                     departure. The vehicle fits the party.
//   · the night     — a departure has none, so its hotel and cruise go; a
//                     night the block includes (a camp) books no hotel. A
//                     hotel for a night in a new city is the operator's pick.
//
// Whatever no rate answers is listed for the operator, and that service is
// left as it was. Pure: the page and the tests share it.

import type { AllRates, GridDay, RateOption, SelectedItem, SlotValue, Intercity } from '@/app/pricing-grid/types'
import { DAY_TYPE_DEFAULTS } from '@/app/pricing-grid/types'
import { airportCodeForCity } from '@/lib/ai/staff-rate-resolution'
import { citiesFarApart as farApart } from '@/lib/pricing/day-trip'
import type { DayBlock } from './blocks'

export interface GridBlock extends DayBlock {
  /** From /api/day-blocks: each paid attraction and the fee(s) it lands on. */
  attraction_checks?: { name: string; ok: boolean; fees?: string[] }[]
}

export interface BlockApplied {
  day: GridDay
  /** What the block added, for the operator's summary. */
  filled: string[]
  /** What no rate answered: the operator picks it. */
  toPick: string[]
}

const norm = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase()
const sameCity = (a: string | null | undefined, b: string | null | undefined) => !!norm(a) && norm(a) === norm(b)

function item(opt: RateOption): SelectedItem {
  return {
    rateId: opt.id,
    name: opt.name,
    rateEur: opt.rateEur,
    rateNonEur: opt.rateNonEur,
    serviceType: opt.service_type,
    pricingClass: opt.pricing_class,
    ...(opt.pricing_basis ? { pricingBasis: opt.pricing_basis, unitCapacity: opt.unit_capacity ?? null } : {}),
    ...(opt.tip_role ? { tipRole: opt.tip_role } : {}),
  }
}

/** The vehicle of a transport route that fits the party: the tier whose band
 *  holds it, else the smallest that seats it, else the largest. */
function vehicleFor(options: RateOption[], pax: number): RateOption | null {
  if (options.length === 0) return null
  const fits = options.filter(o => (o.capacity_min ?? 1) <= pax && pax <= (o.capacity_max ?? 99))
  if (fits.length) return fits.sort((a, b) => a.rateEur - b.rateEur)[0]
  const seats = options.filter(o => (o.capacity_max ?? 99) >= pax).sort((a, b) => (a.capacity_max ?? 99) - (b.capacity_max ?? 99))
  if (seats.length) return seats[0]
  return [...options].sort((a, b) => (b.capacity_max ?? 0) - (a.capacity_max ?? 0))[0]
}

type RouteOption = RateOption & { origin_city?: string | null; destination_city?: string | null }

/** One route (all its vehicle tiers), the first that matches. */
function route(rates: AllRates, pax: number, match: (o: RouteOption) => boolean): RateOption | null {
  const byRoute = new Map<string, RateOption[]>()
  for (const o of rates.route as RouteOption[]) {
    if (!match(o)) continue
    const key = o.id.split('__')[0]
    byRoute.set(key, [...(byRoute.get(key) ?? []), o])
  }
  const first = byRoute.values().next()
  return first.done ? null : vehicleFor(first.value, pax)
}

/** A road move to another city with the night there. */
const ROAD_MOVE = new Set(['intercity_dropoff', 'intercity_transfer'])

/** Where the party sleeps tonight: the city of the hotel the day already has. */
function hotelCity(day: GridDay, rates: AllRates): string | null {
  const hotel = day.slots.find(s => s.slotId === 'accommodation')?.selectedItems[0]
  if (!hotel) return null
  return rates.accommodation.find(o => o.id === hotel.rateId)?.city ?? null
}

const isFlight = (b: DayBlock) => /\b(flight|fly|flies|plane)\b/i.test(b.transport ?? '')
const mentions = (list: readonly string[], re: RegExp) => list.some(a => re.test(a))

/** The day's components, from the block's type and what its assistance says. */
function components(b: DayBlock): Partial<GridDay> {
  const preset = DAY_TYPE_DEFAULTS[b.day_type]
  const intercity: Intercity = b.day_type === 'transfer' || b.night === 'move' ? (isFlight(b) ? 'flight' : 'road') : 'none'
  const a = b.assistance
  const both = mentions(a, /airport both/i)
  return {
    dayType: b.day_type,
    overnight: b.night !== 'none',
    hasSightseeing: b.attractions.length + b.photo_stops.length > 0,
    intercity,
    airportArrival: both || mentions(a, /airport arrival/i) || (a.length === 0 && preset.airportArrival),
    airportDeparture: both || mentions(a, /airport departure/i) || (a.length === 0 && preset.airportDeparture),
    hotelCheckIn: mentions(a, /check-?in/i) || (a.length === 0 && preset.hotelCheckIn),
    hotelCheckOut: mentions(a, /check-?out/i) || (a.length === 0 && preset.hotelCheckOut),
  }
}

export function applyBlockToGridDay(day: GridDay, block: GridBlock, rates: AllRates, pax: number): BlockApplied {
  const filled: string[] = []
  const toPick: string[] = []
  const city = block.city ?? day.city
  const slots = new Map<string, SlotValue>(day.slots.map(s => [s.slotId, { ...s, selectedItems: [...s.selectedItems] }]))
  const set = (slotId: string, items: SelectedItem[]) => {
    const s = slots.get(slotId)
    if (s) slots.set(slotId, { ...s, selectedItems: items, customAmount: 0 })
  }

  // Entrance fees: the paid attractions, as the library resolved them.
  if (block.attractions.length > 0) {
    const fees: SelectedItem[] = []
    for (const name of block.attractions) {
      const check = block.attraction_checks?.find(c => c.name === name)
      const feeNames = check?.ok && check.fees?.length ? check.fees : [name]
      for (const feeName of feeNames) {
        const candidates = rates.entrance_fees.filter(o => norm(o.name) === norm(feeName))
        const opt = candidates.find(o => sameCity(o.city, city)) ?? candidates[0]
        if (opt) {
          if (!fees.some(f => f.rateId === opt.id)) fees.push(item(opt))
        } else {
          toPick.push(`Entrance fee: ${name}`)
        }
      }
    }
    set('entrance_fees', fees)
    if (fees.length) filled.push(`${fees.length} entrance fee(s)`)
  } else {
    set('entrance_fees', [])
  }

  // Guide.
  if (block.guide === 'none') {
    set('guide', [])
  } else {
    const inCity = rates.guide.filter(o => sameCity(o.city, city))
    const pool = inCity.length ? inCity : rates.guide.filter(o => !o.city)
    const kind = block.guide === 'assistant' ? /assistant/i : block.guide === 'spot' ? /spot/i : null
    const opt = kind ? pool.find(o => kind.test(o.name)) : pool.find(o => !/assistant|meet|spot/i.test(o.name)) ?? pool[0]
    const label = block.guide === 'assistant' ? 'English-speaking assistant' : block.guide === 'spot' ? 'Spot guide' : 'Guide'
    if (opt) {
      set('guide', [item(opt)])
      filled.push(label.toLowerCase())
    } else {
      toPick.push(`${label} in ${city || 'this city'}`)
    }
  }

  // Meals at a restaurant; the ship's, the camp's and the hotel's come with the night.
  const meals: SelectedItem[] = []
  for (const m of ['lunch', 'dinner'] as const) {
    const meal = block.meals?.[m]
    if (!meal?.included) continue
    if (/ship|camp|hotel|board/i.test(meal.venue ?? '')) continue
    const opt = rates.meals.find(o => sameCity(o.city, city) && new RegExp(m, 'i').test(o.category || o.name))
    if (opt) {
      meals.push(item(opt))
      filled.push(m)
    } else {
      toPick.push(`${m[0].toUpperCase()}${m.slice(1)} in ${city || 'this city'}`)
    }
  }
  set('meals', meals)

  // Transport.
  const transport: SelectedItem[] = []
  const add = (opt: RateOption | null, missing: string) => {
    if (opt) {
      transport.push(item(opt))
    } else {
      toPick.push(missing)
    }
  }
  const airport = (where: string | null) =>
    route(rates, pax, o => o.service_type === 'airport_transfer' && sameCity(o.origin_city ?? o.city, where))
  const comps = components(block)
  if (comps.intercity === 'flight' && block.to_city) {
    const from = airportCodeForCity(block.city), to = airportCodeForCity(block.to_city)
    const flight = rates.flights.find(o => {
      const f = o as RateOption & { route_from?: string; route_to?: string }
      return [norm(from), norm(block.city)].includes(norm(f.route_from)) && [norm(to), norm(block.to_city)].includes(norm(f.route_to))
    })
    if (flight) {
      set('flights', [item(flight)])
      filled.push('flight')
    } else {
      toPick.push(`Flight ${block.city} → ${block.to_city}`)
    }
    add(airport(block.city), `Airport transfer in ${block.city}`)
    add(airport(block.to_city), `Airport transfer in ${block.to_city}`)
  } else if (comps.intercity === 'road' && block.to_city) {
    // A move by road and a night there: the agency's "Intercity Drop-off".
    // ('intercity_transfer' is the name the rates used to carry — no row
    // has it now, so every road transfer was left for the operator.)
    add(
      route(rates, pax, o => ROAD_MOVE.has(String(o.service_type)) && sameCity(o.origin_city ?? o.city, block.city) && sameCity(o.destination_city, block.to_city)),
      `Road transfer ${block.city} → ${block.to_city}`,
    )
  } else if (block.day_type === 'arrival' || block.day_type === 'departure') {
    if (block.day_type === 'departure' || comps.airportArrival) add(airport(city), `Airport transfer in ${city || 'this city'}`)
  } else if (comps.hasSightseeing && block.day_type !== 'cruise') {
    const dayTour = (o: RouteOption) => o.service_type === 'day_tour'
    const dayTrip = (o: RouteOption) => o.service_type === 'intercity_day_trip'
    const inCity = (o: RouteOption) => dayTour(o) && sameCity(o.origin_city ?? o.city, city) && (!norm(o.destination_city) || sameCity(o.destination_city, city))
    const home = block.night === 'same' ? hotelCity(day, rates) : null
    const outAndBack = home && !sameCity(home, city)
      ? route(rates, pax, o => dayTrip(o) && sameCity(o.origin_city ?? o.city, home) && sameCity(o.destination_city, city))
        ?? route(rates, pax, o => dayTour(o) && sameCity(o.origin_city ?? o.city, home) && sameCity(o.destination_city, city))
      : null
    if (outAndBack) {
      // The party sightsees in one city and sleeps in another — a day trip
      // out and back (Alexandria from a Cairo hotel): the agency's
      // "Intercity Day Trip" from the hotel's city, or a day tour on that road.
      add(outAndBack, '')
    } else if (home && farApart(home, city)) {
      // No rate for that road. A tour inside the city would price the driving
      // around Alexandria and not the road there and back, so none is taken:
      // the operator picks. (A hotel next door — Giza for a Cairo day — is no
      // day trip, and takes the city's own tour below.)
      add(null, `Day trip ${home} → ${city} and back (Intercity Day Trip)`)
    } else {
      // A tour IN the city first; else one that goes TO it (a day trip out of town).
      add(
        route(rates, pax, inCity)
          ?? route(rates, pax, o => dayTrip(o) && sameCity(o.destination_city, city))
          ?? route(rates, pax, o => dayTour(o) && sameCity(o.destination_city, city)),
        `Day tour transport in ${city || 'this city'}`,
      )
    }
  }
  if (transport.length) {
    set('route', transport)
    filled.push('transport')
  }

  // The night.
  if (block.night === 'none') {
    set('accommodation', [])
    set('cruise', [])
  } else if (block.night === 'included') {
    set('accommodation', [])
    filled.push(`night included${block.night_place ? ` (${block.night_place})` : ''}`)
  } else if (block.night === 'move' && block.to_city) {
    const hotel = slots.get('accommodation')?.selectedItems[0]
    const hotelOpt = hotel ? rates.accommodation.find(o => o.id === hotel.rateId) : null
    if (!hotelOpt || !sameCity(hotelOpt.city, block.to_city)) {
      if (hotelOpt) set('accommodation', [])
      toPick.push(`Hotel in ${block.to_city}`)
    }
  }

  return {
    day: {
      ...day,
      title: block.name,
      city: city ?? '',
      description: block.description ?? day.description,
      ...comps,
      slots: day.slots.map(s => slots.get(s.slotId) ?? s),
      blockCode: block.code,
    },
    filled,
    toPick,
  }
}
