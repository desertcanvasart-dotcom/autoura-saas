// ============================================
// B2B quote from an itinerary — the pricing core
// ============================================
// Pure: every rate lookup is injected, so the rules are unit-testable
// without a database. The route (app/api/b2b/quote-from-itinerary) wires
// the engine's canonical lookups in.
//
// The rules (operator decision, 7 Sep):
//   1. A line the pricing grid already priced KEEPS its cost. The route used
//      to re-choose a hotel/guide/meal by tier and overwrite the operator's
//      pick with an arbitrary first-match row, in the wrong currency.
//   2. A line with no cost is priced through the engine — pinned row first
//      (rate_table/rate_id), else the tier lookup, which refuses to guess
//      among several candidates.
//   3. Anything still unpriced is a HOLE. Holes are returned, never priced
//      at 0; the route refuses to create the quote while any exist.

import { ambiguityMessage, type Ambiguity } from '@/lib/pricing/candidate-selection'
import { mealHoleMessage, type MealRatesResult } from '@/lib/auto-pricing-service'
import { applyActivityTiers, type ActivityTier } from '@/lib/rates/activity-tiers'

export interface ItineraryServiceRow {
  service_type?: string | null
  service_name?: string | null
  quantity?: number | null
  unit_cost?: number | null
  total_cost?: number | null
  rate_table?: string | null
  rate_id?: string | null
}

export interface ItineraryDayRow {
  day_number?: number | null
  city?: string | null
  itinerary_services?: ItineraryServiceRow[] | null
}

export interface PropertyRate {
  hotelName?: string
  shipName?: string
  ppdNight: number
  singleSuppNight: number
  source: 'db' | 'fuzzy' | 'missing'
  ambiguous?: Ambiguity
  periodGap?: { propertyName: string; date: string }
}

export interface QuoteLookups {
  hotel(city: string, rateId: string | null): Promise<PropertyRate | null>
  cruise(city: string, rateId: string | null): Promise<PropertyRate | null>
  meals(): Promise<MealRatesResult | null>
  guide(): Promise<{ dailyRate: number; source: 'db' | 'fuzzy' | 'missing'; ambiguous?: Ambiguity } | null>
  entrance(serviceName: string): Promise<{ rate: number } | null>
  tieredActivity(serviceName: string): Promise<{ tiers: ActivityTier[] } | null>
}

export interface RepriceContext {
  tier: string
  numPax: number
  isEurPassport: boolean
  currencySymbol: string
  tourLeaderIncluded: boolean
}

export interface QuoteHole {
  kind: 'hotel' | 'cruise' | 'meal' | 'guide' | 'entrance'
  dayNumber?: number
  service?: string
  message: string
}

export interface SnapshotLine {
  service_name: string
  service_category: string
  rate_source: string
  quantity_mode: 'per_pax' | 'fixed'
  quantity: number
  unit_cost: number
  line_total: number
  day_number: number | null
}

export interface RepriceResult {
  services: SnapshotLine[]
  subtotalCost: number
  tourLeaderCost: number
  singleSupplement: number
  holes: QuoteHole[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

const isHotelType = (t: string) => t === 'accommodation' || t === 'hotel'
const isMealType = (t: string) => t === 'meal'
const isGuideType = (t: string) => t === 'guide'
const isEntranceType = (t: string) => t === 'entrance' || t === 'entrance_fee' || t === 'activity'

/** Why a property lookup did not yield a usable rate. */
function propertyHoleMessage(
  what: 'hotel' | 'cruise',
  r: PropertyRate | null,
  city: string,
  tier: string,
  pinned: boolean
): string {
  const page = what === 'hotel' ? 'Rates → Hotels' : 'Rates → Cruises'
  if (pinned && !r) return `The ${what} this line was priced from is no longer on file (deleted or inactive). Re-pick it in the pricing grid.`
  if (r?.ambiguous) return ambiguityMessage(`${tier} ${what}s in ${city}`, r.ambiguous, page)
  if (r?.periodGap) return `${r.periodGap.propertyName} has rate periods, but none covers ${r.periodGap.date}. Add a period for that date in ${page}.`
  if (r?.source === 'fuzzy') return `No exact ${tier} ${what} rate for ${city} (closest match is a different city or tier). Add it in ${page}.`
  return `No ${tier} ${what} rate for ${city}. Add it in ${page}.`
}

export async function repriceItineraryServices(
  days: ItineraryDayRow[],
  ctx: RepriceContext,
  lookups: QuoteLookups
): Promise<RepriceResult> {
  const services: SnapshotLine[] = []
  const holes: QuoteHole[] = []
  let subtotalCost = 0
  let singleSupplement = 0

  // One lookup per distinct property (city + pin) — the same hotel on three
  // nights is resolved once, and the single supplement reads the same row.
  const propertyCache = new Map<string, Promise<PropertyRate | null>>()
  const resolveProperty = (what: 'hotel' | 'cruise', city: string, rateId: string | null) => {
    const key = `${what}|${rateId ?? ''}|${rateId ? '' : city.toLowerCase()}`
    let p = propertyCache.get(key)
    if (!p) {
      p = what === 'hotel' ? lookups.hotel(city, rateId) : lookups.cruise(city, rateId)
      propertyCache.set(key, p)
    }
    return p
  }
  let mealsPromise: Promise<MealRatesResult | null> | null = null
  const resolveMeals = () => (mealsPromise ??= lookups.meals())
  let guidePromise: ReturnType<QuoteLookups['guide']> | null = null
  const resolveGuide = () => (guidePromise ??= lookups.guide())

  for (const day of days) {
    const city = day.city || 'Cairo'
    const dayNumber = day.day_number ?? null
    for (const svc of day.itinerary_services || []) {
      const type = String(svc.service_type || '')
      const name = String(svc.service_name || '')
      const savedUnit = Number(svc.unit_cost) || 0
      const savedTotal = Number(svc.total_cost) || 0
      const savedQty = Number(svc.quantity) || 0
      const hasSavedCost = savedTotal > 0 || savedUnit > 0

      let unitCost = 0
      let lineTotal = 0
      let quantityMode: 'per_pax' | 'fixed' = savedQty > 1 ? 'per_pax' : 'fixed'
      let rateSource = 'itinerary'
      let priced = false

      if (hasSavedCost) {
        // Rule 1: the grid's number is the operator's decision. Keep it.
        unitCost = savedUnit || savedTotal
        lineTotal = savedTotal || savedUnit * Math.max(savedQty, 1)
        priced = true
      } else if (isHotelType(type)) {
        const isCruise = svc.rate_table === 'nile_cruises'
        const r = await resolveProperty(isCruise ? 'cruise' : 'hotel', city, svc.rate_id ?? null)
        if (r && r.source === 'db') {
          unitCost = r.ppdNight
          lineTotal = unitCost * ctx.numPax
          quantityMode = 'per_pax'
          rateSource = isCruise ? 'nile_cruises' : 'accommodation_rates'
          priced = true
        } else {
          holes.push({
            kind: isCruise ? 'cruise' : 'hotel',
            dayNumber: dayNumber ?? undefined,
            service: name,
            message: propertyHoleMessage(isCruise ? 'cruise' : 'hotel', r, city, ctx.tier, !!svc.rate_id),
          })
        }
      } else if (isMealType(type)) {
        const m = await resolveMeals()
        const kind: 'lunch' | 'dinner' = /dinner/i.test(name) ? 'dinner' : 'lunch'
        if (m?.source === 'db') {
          unitCost = m[kind]
          lineTotal = unitCost * ctx.numPax
          quantityMode = 'per_pax'
          rateSource = 'meal_rates'
          priced = true
        } else {
          holes.push({ kind: 'meal', dayNumber: dayNumber ?? undefined, service: name, message: mealHoleMessage(m, kind, ctx.tier) })
        }
      } else if (isGuideType(type)) {
        const g = await resolveGuide()
        if (g && g.source === 'db') {
          unitCost = g.dailyRate
          lineTotal = g.dailyRate
          quantityMode = 'fixed'
          rateSource = 'guides'
          priced = true
        } else {
          holes.push({
            kind: 'guide',
            dayNumber: dayNumber ?? undefined,
            service: name,
            message: g?.ambiguous
              ? ambiguityMessage(`${ctx.tier} guides`, g.ambiguous, 'CRM → Guides')
              : `No ${ctx.tier} guide rate. Add it in Rates → Guides.`,
          })
        }
      } else if (isEntranceType(type)) {
        // Group-size tiers on the activity first, then the entrance fee —
        // the same precedence as the calculate-price engine.
        const tiered = await lookups.tieredActivity(name)
        if (tiered) {
          const p = applyActivityTiers(tiered.tiers, ctx.numPax, ctx.isEurPassport, ctx.currencySymbol)
          unitCost = p.unitCost
          lineTotal = p.lineTotal
          quantityMode = p.quantityMode
          rateSource = 'activity_tiers'
          priced = true
        } else {
          const fee = await lookups.entrance(name)
          if (fee) {
            unitCost = fee.rate
            lineTotal = fee.rate * ctx.numPax
            quantityMode = 'per_pax'
            rateSource = 'entrance_fees'
            priced = true
          } else {
            holes.push({ kind: 'entrance', dayNumber: dayNumber ?? undefined, service: name, message: `No entrance fee on file for "${name}". Add it in Rates → Attractions.` })
          }
        }
      } else {
        // Other line types (transport, flights, custom amounts…) carry only
        // what the itinerary stored — unchanged behaviour.
        unitCost = savedUnit
        lineTotal = savedTotal
        priced = true
      }

      if (!priced) continue
      subtotalCost += lineTotal
      services.push({
        service_name: name,
        service_category: type,
        rate_source: rateSource,
        quantity_mode: quantityMode,
        quantity: quantityMode === 'per_pax' ? ctx.numPax : 1,
        unit_cost: round2(unitCost),
        line_total: round2(lineTotal),
        day_number: dayNumber,
      })

      // Single supplement: from the SAME hotel row the line came from —
      // pinned when the grid recorded it, else the tier lookup (which may be
      // a hole even when the bed cost is known: the supplement is not).
      if (isHotelType(type) && svc.rate_table !== 'nile_cruises') {
        const r = await resolveProperty('hotel', city, svc.rate_id ?? null)
        if (r && r.source === 'db') {
          singleSupplement += r.singleSuppNight
        } else if (hasSavedCost) {
          // The bed cost was kept above; the supplement is the only gap.
          holes.push({
            kind: 'hotel',
            dayNumber: dayNumber ?? undefined,
            service: name,
            message: `Single supplement: ${propertyHoleMessage('hotel', r, city, ctx.tier, !!svc.rate_id)}`,
          })
        }
        // If the line itself was a hole, that hole already says it all.
      }
    }
  }

  // Tour leader: the default guide ask, through the engine — a hole when it
  // cannot name one, never the first active guide's fee.
  let tourLeaderCost = 0
  if (ctx.tourLeaderIncluded) {
    const g = await resolveGuide()
    if (g && g.source === 'db') {
      const touringDays = Math.max(days.length - 1, 1)
      tourLeaderCost = g.dailyRate * touringDays
      subtotalCost += tourLeaderCost
    } else {
      holes.push({
        kind: 'guide',
        service: 'Tour leader',
        message: g?.ambiguous
          ? ambiguityMessage(`${ctx.tier} guides`, g.ambiguous, 'CRM → Guides')
          : `Tour leader included but no ${ctx.tier} guide rate is on file. Add it in Rates → Guides.`,
      })
    }
  }

  return {
    services,
    subtotalCost: round2(subtotalCost),
    tourLeaderCost: round2(tourLeaderCost),
    singleSupplement: round2(singleSupplement),
    holes,
  }
}
