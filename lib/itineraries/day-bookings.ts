// ============================================
// What a day has booked — read off its service lines
// ============================================
// The itinerary editor's day card had its own Guide / Lunch / Dinner / Hotel
// tick boxes, stored as day flags, and two boxes (Water, Tips) that were
// always ticked and could not be changed. None of them was the booking: the
// hotel, the guide, the meals and the tips are the day's service LINES (what
// the Pricing Grid saves and reloads). So a box could say "Hotel" while no
// hotel was booked, and the card never showed WHICH hotel.
//
// The lines are the truth. This reads them into what the card shows (one chip
// per booking) and into the day flags the share page and tasks read, so the
// flags follow the lines instead of being a second, separate answer.

import { propertyFromService, type ServiceLike } from './overnight-property'

export type BookingKind =
  | 'hotel' | 'cruise' | 'guide' | 'lunch' | 'dinner' | 'meal'
  | 'tips' | 'water' | 'transport' | 'entrance' | 'activity' | 'flight' | 'other'

export interface BookingLine extends ServiceLike {
  id: string
  /** The rate row the line was priced from (migration 353). */
  rate_table?: string | null
  rate_id?: string | null
  /** The AI generator keeps the hotel's rate row id here. */
  service_code?: string | null
}

export interface DayBooking {
  kind: BookingKind
  label: string
  serviceId: string
}

/** The grid tags its lines "[pricing-grid:<slot>] …". */
const GRID_TAG = /^\[pricing-grid:([a-z_]+)\]/

/** Lines that share the night's type but are not the night. */
const NOT_THE_NIGHT = /^(hotel supplement|cruise supplement|throughout guide|guide bed|guide cabin|single supplement|triple reduction)\b/i

const SLOT_KIND: Record<string, BookingKind> = {
  accommodation: 'hotel',
  cruise: 'cruise',
  guide: 'guide',
  meals: 'meal',
  tipping: 'tips',
  water: 'water',
  route: 'transport',
  entrance_fees: 'entrance',
  experiences: 'activity',
  boat_rides: 'activity',
  flights: 'flight',
}

const TYPE_KIND: Record<string, BookingKind> = {
  accommodation: 'hotel',
  hotel: 'hotel',
  cruise: 'cruise',
  guide: 'guide',
  meal: 'meal',
  lunch: 'lunch',
  dinner: 'dinner',
  tips: 'tips',
  tipping: 'tips',
  transportation: 'transport',
  transport: 'transport',
  entrance: 'entrance',
  activity: 'activity',
  flight: 'flight',
}

/** A meal line says which meal in its name or description, or it doesn't. */
function mealKind(s: ServiceLike): BookingKind {
  const text = `${s.service_name ?? ''} ${s.description ?? ''}`.toLowerCase()
  if (/\blunch\b/.test(text)) return 'lunch'
  if (/\bdinner\b/.test(text)) return 'dinner'
  return 'meal'
}

/** What one line books. */
export function bookingKind(s: ServiceLike): BookingKind {
  const tag = String(s.description ?? '').match(GRID_TAG)?.[1]
  // The throughout guide's bed, meals and seats ride on the day, but they
  // are the guide's, not the traveller's night or meal.
  if (tag === 'throughout_guide') return 'other'

  let kind: BookingKind | undefined = tag ? SLOT_KIND[tag] : undefined
  if (!kind) {
    const type = String(s.service_type ?? '').toLowerCase()
    kind = TYPE_KIND[type]
    if (!kind && type === 'supplies' && /water/i.test(String(s.service_name ?? ''))) kind = 'water'
  }
  if (!kind) return 'other'
  if (kind === 'meal') return mealKind(s)
  // A supplement or a guide's bed shares the type but is not the night.
  if ((kind === 'hotel' || kind === 'cruise') && NOT_THE_NIGHT.test(String(s.service_name ?? '').trim())) return 'other'
  return kind
}

const SHORT: Partial<Record<BookingKind, string>> = {
  guide: 'Guide', lunch: 'Lunch', dinner: 'Dinner', tips: 'Tips', water: 'Water',
}

/** The day's bookings, one chip per line, in a steady order. */
export function dayBookings(lines: readonly BookingLine[]): DayBooking[] {
  const order: BookingKind[] = ['hotel', 'cruise', 'guide', 'transport', 'flight', 'entrance', 'activity', 'lunch', 'dinner', 'meal', 'tips', 'water', 'other']
  return lines
    .map(s => {
      const kind = bookingKind(s)
      const property = kind === 'hotel' || kind === 'cruise' ? propertyFromService(s) : null
      const label = property?.name || SHORT[kind] || String(s.service_name ?? '').trim() || kind
      return { kind, label, serviceId: s.id }
    })
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
}

export interface DayIncludes {
  guide: boolean
  /** null: a meal line names no meal, so the lines cannot say. */
  lunch: boolean | null
  dinner: boolean | null
  hotel: boolean
  tips: boolean
  water: boolean
}

/** What the day's lines include — the day flags, read from the bookings. */
export function includesFromLines(lines: readonly ServiceLike[]): DayIncludes {
  const kinds = new Set(lines.map(bookingKind))
  const unnamedMeal = kinds.has('meal')
  return {
    guide: kinds.has('guide'),
    lunch: kinds.has('lunch') ? true : unnamedMeal ? null : false,
    dinner: kinds.has('dinner') ? true : unnamedMeal ? null : false,
    hotel: kinds.has('hotel') || kinds.has('cruise'),
    tips: kinds.has('tips'),
    water: kinds.has('water'),
  }
}
