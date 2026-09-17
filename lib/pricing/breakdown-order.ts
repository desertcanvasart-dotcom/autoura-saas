// ============================================
// The cost breakdown reads like the day runs
// ============================================
// The engine emits its lines in the order it happens to compute them — guide
// and tips first, then airport and hotel assistance, then the night, then
// entrance fees, meals, water, and transport last — and the old sort pushed
// every fixed cost ahead of every per-person one on top of that. An operator
// checking a quote against the programme read a day as a shuffled list and
// could not see what was missing.
//
// This is the one ordering rule, shared by the engine's result and the
// calculator page, so a saved quote's lines are in the same order as the
// screen that produced them. Pure: no database, no framework.
//
// Within a day the order is the day's own flow: breakfast, leaving the hotel,
// the travel leg and the transfers around it, arriving at the next hotel, the
// guide and the sights, lunch, dinner, the night's bed, and the day's tips.
// Lines with no day of their own (the cruise's whole-trip lines, a water
// allowance across all days) come last.
//
// Ported from the sibling app (travel-ops-pro #446), matched to THIS engine's
// line ids (lib/auto-pricing-service.ts).

/** The fields the rule needs. Engine lines and B2B response lines both map to it. */
export interface FlowLine {
  id: string
  category: string
  dayNumber: number | null | undefined
}

const RANK = {
  breakfast: 5,
  hotelCheckout: 10,
  airportDeparture: 20,
  ticket: 30,
  guideTicket: 31,
  airportArrival: 35,
  transport: 40,
  hotelCheckin: 45,
  guide: 50,
  entrance: 60,
  water: 65,
  lunch: 70,
  guideLunch: 71,
  dinner: 80,
  guideDinner: 81,
  other: 85,
  night: 90,
  nightSupplement: 91,
  guideBed: 92,
  tips: 95,
  extra: 97,
} as const

/** Where a line sits inside its day. Lower comes first. */
export function flowRank(line: Pick<FlowLine, 'id' | 'category'>): number {
  const id = (line.id ?? '').toLowerCase()
  const cat = (line.category ?? '').toLowerCase()

  if (id.includes('-breakfast')) return RANK.breakfast
  if (id.includes('guide-lunch')) return RANK.guideLunch
  if (id.includes('guide-dinner')) return RANK.guideDinner
  if (id.includes('-lunch')) return RANK.lunch
  if (id.includes('-dinner')) return RANK.dinner

  // "disembark" contains "embark": leaving the ship is checked first.
  if (id.includes('hotel-checkout') || id.includes('cruise-disembark')) return RANK.hotelCheckout
  if (id.includes('cruise-embark')) return RANK.hotelCheckin
  if (id.includes('hotel-checkin')) return RANK.hotelCheckin
  if (id.includes('airport-departure')) return RANK.airportDeparture
  if (id.includes('airport-arrival')) return RANK.airportArrival

  // This engine writes the guide's own ticket as `dayN-guide-flight-…`,
  // `-guide-train-…`, `-guide-sleeper-…`; the traveller's as `dayN-flight-…`.
  if (id.includes('guide-flight') || id.includes('guide-train') || id.includes('guide-sleeper')) return RANK.guideTicket
  if (id.includes('-flight-') || id.includes('-train-') || id.includes('-sleeper-')) return RANK.ticket
  if (id.includes('guide-bed') || id.includes('guide-cabin')) return RANK.guideBed
  if (id.includes('-supp-')) return RANK.nightSupplement
  if (id.includes('-tips')) return RANK.tips
  if (id.startsWith('water-')) return RANK.water
  if (id.startsWith('entrance-')) return RANK.entrance

  switch (cat) {
    case 'meal':
      return RANK.lunch
    case 'flight':
    case 'train':
      return RANK.ticket
    case 'transportation':
    case 'transport':
      return RANK.transport
    case 'airport_service':
      return RANK.airportArrival
    case 'hotel_service':
      return RANK.hotelCheckin
    case 'guide':
      return RANK.guide
    case 'entrance':
    case 'activity':
      return RANK.entrance
    case 'water':
    case 'supplies':
      return RANK.water
    case 'accommodation':
    case 'cruise':
      return RANK.night
    case 'tips':
      return RANK.tips
    case 'extra':
    case 'upgrade':
    case 'addon':
      return RANK.extra
    default:
      return RANK.other
  }
}

/**
 * Day by day, each day in its own flow. Stable: two lines of the same rank on
 * the same day keep the order the engine produced them in (two entrance fees
 * stay in programme order).
 */
export function sortByItineraryFlow<T>(items: readonly T[], toLine: (item: T) => FlowLine): T[] {
  const dayKey = (d: number | null | undefined) =>
    typeof d === 'number' && d > 0 ? d : Number.POSITIVE_INFINITY
  return items
    .map((item, index) => ({ item, index, line: toLine(item) }))
    .sort((a, b) =>
      dayKey(a.line.dayNumber) - dayKey(b.line.dayNumber) ||
      flowRank(a.line) - flowRank(b.line) ||
      a.index - b.index)
    .map(x => x.item)
}

/**
 * Does this breakdown line stand for a real service to book?
 *
 * The breakdown also lists lines that only make a day read whole: meals already
 * inside the hotel or cabin rate, free sites, sights that matched no fee. None
 * is a service, and a quote that carries them converts into zero-cost bookings
 * nobody can act on. A line with NO RATE is different — it is a real service
 * (a hotel night, a transfer) the operator still has to book, so it stays.
 */
export function isBookableLine(line: { unpriced?: boolean; included?: boolean; issue?: string }): boolean {
  if (line.included) return false
  if (line.issue && !line.unpriced) return false
  return true
}
