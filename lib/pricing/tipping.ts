// ============================================
// Tipping — every unit and every context on the form, not just "Per Day"
// ============================================
// Rates → Tipping offers five units (Per Day, Per Service, Per Cruise, Per
// Night, Per Person) and nine contexts (Day Tour, Half Day Tour, Cruise,
// Transfer, Airport, Hotel, Restaurant, Felucca, Motorboat). Until 2026-09-21
// the engine read ONE of those forty-five combinations: it summed the Per Day
// rows on sightseeing days and ignored everything else. Sawa Tours, Afford
// Egypt and Travel2Egypt had typed their restaurant tips as Per Service — and
// every one of their tours was held up by "no tipping rate".
//
// THE OPERATOR'S THREE DECISIONS (2026-09-21)
//   1. "Per Person" = the amount × the travellers × every DAY its context
//      applies. Every other unit is an amount for the GROUP.
//   2. No tier scaling. The engine used to multiply every tip by 0.8 … 1.5 by
//      tier, and round it — a 500 driver tip was charged as 400 to 750. The
//      amount typed is the amount charged.
//   3. Tipping is never a gap. The tipping sheet IS the agency's policy: every
//      row whose occasion happens is charged, and a tour is not incomplete
//      for the tips an agency chose not to have.
//
// THE RULE — a row is charged when its CONTEXT happens, counted by its UNIT.
//
//   context          happens on a day when…                  a "service" is…
//   ---------------  --------------------------------------  ------------------
//   day_tour         the day has guided sightseeing (*)      the day
//   half_day_tour    …and that sightseeing is a half day     the day
//   cruise           the night is aboard                     the day
//   transfer         the day has a transfer                  each transfer
//   airport          there is an airport meet / assist       each one
//   hotel            the night is in a hotel                 each check-in/out
//   restaurant       a meal is at a restaurant               each such meal
//   (none)           the day has guided sightseeing          the day
//   felucca, motorboat, or a context the agency added:
//                    NEVER — a tour's days do not record boat rides, and the
//                    engine cannot know what an added context means. Such
//                    rows are reported as not priced, never silently dropped.
//
//   (*) On a HALF-day a role's half_day_tour row replaces its day_tour row —
//       the specific beats the general, as the city row beats the all-cities
//       one. A role with no half-day row is tipped its day-tour amount.
//
//   unit          charged
//   ------------  ---------------------------------------------------------
//   per_day       once for each day the context happens
//   per_service   once for each service (see above) on those days
//   per_night     once for each night — hotel / cruise context, or none
//   per_cruise    once for each sailing (a run of nights aboard)
//   per_person    × travellers, once for each day the context happens
//
// CITY: rows are grouped by role + context + unit and exactly ONE is charged
// per group — the day's own city if it has a row, else the all-cities row.
// (Summing every row would tip the Cairo driver AND the Aswan driver daily.)
//
// Pure and import-free.

export const TIP_UNITS = ['per_day', 'per_service', 'per_night', 'per_cruise', 'per_person'] as const
export type TipUnit = typeof TIP_UNITS[number]

export const PRICED_TIP_CONTEXTS = ['day_tour', 'half_day_tour', 'cruise', 'transfer', 'airport', 'hotel', 'restaurant'] as const
export type TipContext = typeof PRICED_TIP_CONTEXTS[number] | ''

export interface TippingRow {
  id?: string
  role_type?: string | null
  context?: string | null
  rate_unit?: string | null
  /** In the run's currency already (normalizeRateRows). */
  rate_eur?: number | string | null
  city?: string | null
}

/** What happens on a day that a tip can be for. The engine fills this in. */
export interface DayOccasions {
  day: number
  city?: string | null
  /** Guided sightseeing: a guide and a vehicle work this day. */
  sightseeing: 'full' | 'half' | null
  restaurantMeals: number
  transfers: number
  airportServices: number
  hotelServices: number
  night: 'hotel' | 'cruise' | null
}

export interface TipLine {
  day: number
  role: string
  context: string
  unit: TipUnit
  /** The row's amount, as typed. */
  amount: number
  /** How many times it is charged on this day. */
  quantity: number
  /** true = × travellers (Per Person); false = an amount for the group. */
  perPerson: boolean
  rowId?: string
}

export interface UnpricedTipRow {
  rowId?: string
  role: string
  context: string
  unit: string
  reason: string
}

const norm = (v?: string | null) => (v ?? '').trim().toLowerCase()
const isUnit = (u: string): u is TipUnit => (TIP_UNITS as readonly string[]).includes(u)
const isPricedContext = (c: string): c is TipContext => c === '' || (PRICED_TIP_CONTEXTS as readonly string[]).includes(c)

/** Does the context happen on this day — and how many services is that? */
function occasion(context: TipContext, d: DayOccasions): { happens: boolean; services: number } {
  switch (context) {
    case '':
    case 'day_tour':      return { happens: d.sightseeing !== null, services: d.sightseeing !== null ? 1 : 0 }
    case 'half_day_tour': return { happens: d.sightseeing === 'half', services: d.sightseeing === 'half' ? 1 : 0 }
    case 'cruise':        return { happens: d.night === 'cruise', services: d.night === 'cruise' ? 1 : 0 }
    case 'transfer':      return { happens: d.transfers > 0, services: d.transfers }
    case 'airport':       return { happens: d.airportServices > 0, services: d.airportServices }
    case 'hotel':         return { happens: d.night === 'hotel', services: d.hotelServices }
    case 'restaurant':    return { happens: d.restaurantMeals > 0, services: d.restaurantMeals }
  }
}

/** Why a row can never be charged, or null when it can. Shown on the form. */
export function whyTipRowIsNotPriced(row: TippingRow): string | null {
  const unit = norm(row.rate_unit), context = norm(row.context)
  if (!(Number(row.rate_eur) > 0)) return 'It has no amount.'
  if (!isUnit(unit)) return `"${row.rate_unit}" is a unit your agency added — pricing does not know how to count it. Use Per Day, Per Service, Per Night, Per Cruise or Per Person.`
  if (context === 'felucca' || context === 'motorboat') return 'Tours do not record boat rides on their days, so there is nothing to count this against yet.'
  if (!isPricedContext(context)) return `"${row.context}" is a context your agency added — pricing does not know when it happens.`
  if (unit === 'per_night' && !(context === '' || context === 'hotel' || context === 'cruise')) return 'Per Night only counts nights: use the Hotel or Cruise context (or none).'
  if (unit === 'per_cruise' && !(context === '' || context === 'cruise')) return 'Per Cruise only counts sailings: use the Cruise context (or none).'
  return null
}

/** In words, how a priced row is counted — shown on the form as it is filled in. */
export function howTipIsCounted(row: Pick<TippingRow, 'context' | 'rate_unit'>): string {
  const unit = norm(row.rate_unit), context = norm(row.context)
  const WHEN: Record<string, string> = {
    '': 'day with guided sightseeing', day_tour: 'day with guided sightseeing', half_day_tour: 'half-day of sightseeing',
    cruise: 'day aboard', transfer: 'day with a transfer', airport: 'day with an airport meet or assist',
    hotel: 'day with a hotel night', restaurant: 'day with a restaurant meal',
  }
  const SERVICE: Record<string, string> = {
    '': 'guided sightseeing day', day_tour: 'guided sightseeing day', half_day_tour: 'half-day of sightseeing', cruise: 'day aboard',
    transfer: 'transfer', airport: 'airport meet or assist', hotel: 'hotel check-in or check-out', restaurant: 'restaurant meal',
  }
  const city = ' The day\'s own city row is used if there is one, otherwise the "any city" row.'
  switch (unit) {
    case 'per_day': return `Charged once for the group on every ${WHEN[context]}.` + city
    case 'per_service': return `Charged once for the group for every ${SERVICE[context]}.` + city
    case 'per_night': return `Charged once for the group for every ${context === 'hotel' ? 'hotel night' : context === 'cruise' ? 'night aboard' : 'night'}.` + city
    case 'per_cruise': return 'Charged once for the group for each sailing, however many nights it lasts.' + city
    case 'per_person': return `Charged for EACH traveller on every ${WHEN[context]}.` + city
    default: return ''
  }
}

/**
 * Every tip a tour is charged, day by day. `days` must be in order.
 */
export function tipLinesForTour(
  rows: readonly TippingRow[],
  days: readonly DayOccasions[]
): { lines: TipLine[]; unpriced: UnpricedTipRow[] } {
  const lines: TipLine[] = []
  const unpriced: UnpricedTipRow[] = []

  // One group per role + context + unit; the city picks the row within it.
  const groups = new Map<string, TippingRow[]>()
  for (const row of rows) {
    const reason = whyTipRowIsNotPriced(row)
    if (reason) {
      unpriced.push({ rowId: row.id, role: row.role_type ?? '', context: row.context ?? '', unit: row.rate_unit ?? '', reason })
      continue
    }
    const key = `${norm(row.role_type)}|${norm(row.context)}|${norm(row.rate_unit)}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  // A role that has a half-day row is tipped THAT on a half day, not both.
  const halfDayRoles = new Set(
    [...groups.keys()].filter(k => k.split('|')[1] === 'half_day_tour').map(k => `${k.split('|')[0]}|${k.split('|')[2]}`)
  )

  // The first night of each run of nights aboard is where a sailing is charged.
  const sailingStarts = new Set<number>()
  days.forEach((d, i) => { if (d.night === 'cruise' && days[i - 1]?.night !== 'cruise') sailingStarts.add(d.day) })

  for (const d of days) {
    const here = norm(d.city)
    for (const [key, group] of groups) {
      const [role, contextKey, unitKey] = key.split('|')
      const context = contextKey as TipContext
      const unit = unitKey as TipUnit
      const row = (here !== '' ? group.find(r => norm(r.city) === here) : undefined) ?? group.find(r => !norm(r.city))
      if (!row) continue

      if ((context === 'day_tour' || context === '') && d.sightseeing === 'half' && halfDayRoles.has(`${role}|${unit}`)) continue

      const { happens, services } = occasion(context, d)
      let quantity = 0
      if (unit === 'per_day' || unit === 'per_person') quantity = happens ? 1 : 0
      else if (unit === 'per_service') quantity = happens ? services : 0
      else if (unit === 'per_night') {
        quantity = context === 'hotel' ? (d.night === 'hotel' ? 1 : 0)
          : context === 'cruise' ? (d.night === 'cruise' ? 1 : 0)
          : d.night ? 1 : 0
      } else if (unit === 'per_cruise') quantity = sailingStarts.has(d.day) ? 1 : 0
      if (quantity <= 0) continue

      lines.push({
        day: d.day, role: row.role_type ?? '', context: row.context ?? '', unit,
        amount: Number(row.rate_eur), quantity, perPerson: unit === 'per_person', rowId: row.id,
      })
    }
  }
  return { lines, unpriced }
}

/** The group's tips, and each traveller's, for the whole tour. */
export function tipTotals(lines: readonly TipLine[]): { group: number; perPerson: number } {
  let group = 0, perPerson = 0
  for (const l of lines) {
    if (l.perPerson) perPerson += l.amount * l.quantity
    else group += l.amount * l.quantity
  }
  return { group, perPerson }
}
