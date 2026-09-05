import { describe, it, expect } from 'vitest'
import type { GridDay, GridConfig, SlotValue, RateOption } from '@/app/pricing-grid/types'
import {
  buildGuideRateIndex,
  computeThroughoutGuideExtras,
} from '@/app/pricing-grid/lib/throughout-guide'
import { calculateGrandTotals, calculatePaxRange, buildTransportTierIndex } from '@/app/pricing-grid/lib/calculator'
import { mapServicesToSlots } from '@/app/pricing-grid/lib/slot-mapping'
import { SLOT_DEFINITIONS } from '@/app/pricing-grid/types'

// ============================================
// The grid learns the throughout guide (B-item 3)
// ============================================
// Pure grid math from what the slots already hold: bed from the chosen
// property's first-period guide rate; meals when pax ≤ 3; a seat per
// flight pick at the guide fare else customer fare (a real 0 = rides
// free); the sheet sizes vehicles at pax+1; unpriced bed nights are an
// amber count, never a silent zero; the saved synthetic rows are skipped
// on reload so the money never doubles.

const emptySlots = (): SlotValue[] =>
  SLOT_DEFINITIONS.map(def => ({ slotId: def.slotId, selectedItems: [], customAmount: 0 }))

function day(n: number, fills: Partial<Record<string, SlotValue['selectedItems']>>): GridDay {
  const slots = emptySlots()
  for (const [slotId, items] of Object.entries(fills)) {
    slots.find(s => s.slotId === slotId)!.selectedItems = items!
  }
  return { id: `d${n}`, dayNumber: n, title: `Day ${n}`, city: 'Cairo', description: '', isExpanded: false, slots }
}

const CONFIG: GridConfig = {
  pax: 2,
  passport: 'eu',
  tier: 'standard',
  clientType: 'b2c',
  withGuide: true,
  guideMode: 'throughout',
  currency: 'EUR',
  marginPercent: 0,
  exchangeRate: null,
  startDate: '2026-10-01',
  clientName: '', clientEmail: '', clientPhone: '', tourName: '', nationality: '',
  itineraryId: null, itineraryCode: null, partnerId: null, partnerName: '', clientId: null,
}

const HOTEL_OPT: RateOption = { id: 'h1', name: 'Cairo Grand', rateEur: 55, rateNonEur: 60, guide_rate_eur: 18 }
const HOTEL_NO_GUIDE: RateOption = { id: 'h2', name: 'Luxor Grand', rateEur: 40, rateNonEur: 45, guide_rate_eur: null }
const FLIGHT_OPT: RateOption = { id: 'f1', name: 'MS123 CAI→LXR', rateEur: 120, rateNonEur: 130, guide_rate_eur: 80 }
const FLIGHT_FREE_GUIDE: RateOption = { id: 'f2', name: 'MS456', rateEur: 100, rateNonEur: 110, guide_rate_eur: 0 }
const FLIGHT_NO_GUIDE: RateOption = { id: 'f3', name: 'NP789', rateEur: 90, rateNonEur: 95 }

const INDEX = buildGuideRateIndex({ accommodation: [HOTEL_OPT, HOTEL_NO_GUIDE], flights: [FLIGHT_OPT, FLIGHT_FREE_GUIDE, FLIGHT_NO_GUIDE] })

const pick = (opt: RateOption) => [{ rateId: opt.id, name: opt.name, rateEur: opt.rateEur, rateNonEur: opt.rateNonEur }]

describe('computeThroughoutGuideExtras', () => {
  it('spot mode computes nothing', () => {
    const r = computeThroughoutGuideExtras([day(1, { accommodation: pick(HOTEL_OPT) })], { ...CONFIG, guideMode: 'spot' }, INDEX)
    expect(r.extras).toEqual([])
    expect(r.unpricedBedDays).toEqual([])
  })

  it("the bed comes from the chosen property's guide rate; a missing one is AMBER, never zero", () => {
    const r = computeThroughoutGuideExtras(
      [day(1, { accommodation: pick(HOTEL_OPT) }), day(2, { accommodation: pick(HOTEL_NO_GUIDE) })],
      CONFIG,
      INDEX
    )
    expect(r.extras).toEqual([
      { dayNumber: 1, kind: 'bed', label: 'Throughout Guide — bed (Cairo Grand)', amountEur: 18 },
    ])
    expect(r.unpricedBedDays).toEqual([2])
    expect(r.totalEur).toBe(18)
  })

  it('meals: one extra portion of the day picks at ≤3 pax; nothing at 4+', () => {
    const days = [day(1, { meals: [{ rateId: 'm1', name: 'Lunch', rateEur: 15, rateNonEur: 17 }] })]
    const small = computeThroughoutGuideExtras(days, { ...CONFIG, pax: 3 }, INDEX)
    expect(small.extras).toEqual([
      { dayNumber: 1, kind: 'meal', label: 'Throughout Guide — meal (Lunch)', amountEur: 15 },
    ])
    const big = computeThroughoutGuideExtras(days, { ...CONFIG, pax: 4 }, INDEX)
    expect(big.extras).toEqual([])
  })

  it('flight seats: guide fare wins, a real 0 rides free, no fare = customer fare', () => {
    const r = computeThroughoutGuideExtras(
      [day(1, { flights: [...pick(FLIGHT_OPT), ...pick(FLIGHT_FREE_GUIDE), ...pick(FLIGHT_NO_GUIDE)] })],
      CONFIG,
      INDEX
    )
    expect(r.extras.map(e => e.amountEur)).toEqual([80, 0, 90])
  })
})

describe('totals and the rate sheet', () => {
  it('the extras join the single-quote total as a group cost', () => {
    const days = [day(1, { accommodation: pick(HOTEL_OPT) })]
    const base = calculateGrandTotals(days, CONFIG)
    const withGuideBed = calculateGrandTotals(days, CONFIG, { throughoutGroupExtraEur: 18 })
    // 18 across 2 pax = 9/pp.
    expect(withGuideBed.costPerPerson - base.costPerPerson).toBeCloseTo(9, 2)
  })

  it('the sheet sizes vehicles at pax+1 and carries the extras at every count', () => {
    // One transport row with two tiers: sedan (1–3) and minivan (4–7).
    const routeOptions: RateOption[] = [
      { id: 'r1__sedan', name: 'Sedan', rateEur: 100, rateNonEur: 100, capacity_min: 1, capacity_max: 3 },
      { id: 'r1__minivan', name: 'Minivan', rateEur: 200, rateNonEur: 200, capacity_min: 4, capacity_max: 7 },
    ]
    const tierIndex = buildTransportTierIndex(routeOptions)
    const days = [day(1, { route: [{ rateId: 'r1__sedan', name: 'Sedan', rateEur: 100, rateNonEur: 100 }] })]

    const spot = calculatePaxRange(days, { ...CONFIG, guideMode: 'spot' }, tierIndex)
    const thru = calculatePaxRange(days, CONFIG, tierIndex, { throughoutGroupExtraEur: 18, throughoutExtraSeats: 1 })

    const at = (r: typeof spot, pax: number) => r.paxPricing.find(p => p.numPax === pax)!.withoutLeader.totalCost
    // pax 3: spot rides the Sedan (100); throughout sizes at 4 → Minivan
    // (200) and carries the 18 bed: +118.
    expect(at(thru, 3) - at(spot, 3)).toBeCloseTo(118, 2)
    // pax 2: 3 seats still fit the Sedan — only the bed differs.
    expect(at(thru, 2) - at(spot, 2)).toBeCloseTo(18, 2)
    // Tour-leader rows stack: leader row at pax 3 sizes at 3+1+1 = 5 (Minivan).
    const leaderThru = thru.paxPricing.find(p => p.numPax === 3)!.withLeader.totalCost
    const leaderSpot = spot.paxPricing.find(p => p.numPax === 3)!.withLeader.totalCost
    expect(leaderThru - leaderSpot).toBeCloseTo(18, 2) // both already Minivan at 4/5 seats
  })
})

describe('reload never doubles the synthetic rows', () => {
  it('mapServicesToSlots skips throughout_guide-tagged services', () => {
    const slots = mapServicesToSlots(
      [
        { id: 's1', service_type: 'accommodation', service_name: 'Cairo Grand', quantity: 2, rate_eur: 55, rate_non_eur: 60, total_cost: 110, description: '[pricing-grid:accommodation] Cairo Grand' },
        { id: 's2', service_type: 'accommodation', service_name: 'Throughout Guide — bed (Cairo Grand)', quantity: 1, rate_eur: 18, rate_non_eur: 18, total_cost: 18, description: '[pricing-grid:throughout_guide] bed' },
      ],
      2
    )
    const accommodation = slots.find(s => s.slotId === 'accommodation')!
    expect(accommodation.selectedItems).toHaveLength(1)
    expect(accommodation.selectedItems[0].name).toBe('Cairo Grand')
  })
})
