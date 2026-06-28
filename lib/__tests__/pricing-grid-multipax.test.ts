import { describe, it, expect } from 'vitest'

// Phase 1 of "B2B rate sheet as a shape of the one grid engine": the grid
// calculator can price a trip across a pax RANGE, re-selecting the vehicle tier
// per pax count. calculator.ts is a pure module (no Supabase), so these run in
// isolation with synthetic rates and HAND-COMPUTED expected values.
//
// The oracle is the canonical decomposition that auto-pricing-service's per-pax
// loop also implements:
//     totalCost(pax) = GroupFixed + Transport(pax) + PerPerson × pax
//     selling        = totalCost × (1 + margin)
//     pricePerPerson = selling / pax        (divided by PAYING pax, even +leader)
// Proving the grid core reproduces these numbers — including the non-linear
// transport term — is the Phase 1 parity gate. Cross-engine golden-master
// against the live (DB-backed) auto-pricing engine is the Phase 4 wiring gate.

import {
  buildTransportTierIndex,
  calculatePaxRange,
} from '@/app/pricing-grid/lib/calculator'
import type {
  GridConfig, GridDay, RateOption, SelectedItem, SlotValue,
} from '@/app/pricing-grid/types'

// --- Fixtures ---------------------------------------------------------------

// One transport SERVICE (rowId 'T1') with three vehicle tiers.
const ROUTE_OPTIONS: RateOption[] = [
  { id: 'T1__sedan',   name: 'Sedan (1-2)',   rateEur: 100, rateNonEur: 110, capacity_min: 1, capacity_max: 2  },
  { id: 'T1__minivan', name: 'Minivan (3-7)', rateEur: 150, rateNonEur: 165, capacity_min: 3, capacity_max: 7  },
  { id: 'T1__van',     name: 'Van (8-14)',    rateEur: 220, rateNonEur: 240, capacity_min: 8, capacity_max: 14 },
]

function item(over: Partial<SelectedItem> & { rateId: string; rateEur: number; rateNonEur: number }): SelectedItem {
  return { name: over.name ?? over.rateId, ...over }
}

function slot(slotId: string, selectedItems: SelectedItem[], customAmount = 0): SlotValue {
  return { slotId, selectedItems, customAmount }
}

// A trip that, per day, has: a day_tour transport (operator originally picked
// the Sedan tier), a fixed guide, double-occupancy accommodation + single supp,
// and one entrance fee. Single day keeps the arithmetic obvious.
function tripDay(): GridDay {
  return {
    id: 'd1', dayNumber: 1, title: 'Day 1', city: 'Cairo', description: '', isExpanded: false,
    slots: [
      slot('route', [item({ rateId: 'T1__sedan', name: 'Sedan', rateEur: 100, rateNonEur: 110, serviceType: 'day_tour' })]),
      slot('guide', [item({ rateId: 'g1', rateEur: 120, rateNonEur: 120 })]),
      slot('accommodation', [
        item({ rateId: 'h1', rateEur: 80, rateNonEur: 90 }),
        item({ rateId: 'h1_supp', name: 'Single Supplement', rateEur: 40, rateNonEur: 45 }),
      ]),
      slot('entrance_fees', [item({ rateId: 'e1', rateEur: 30, rateNonEur: 35 })]),
    ],
  }
}

function cfg(over: Partial<GridConfig> = {}): GridConfig {
  return {
    pax: 2, passport: 'eu', tier: 'standard', clientType: 'b2b', withGuide: true,
    currency: 'EUR', marginPercent: 25, exchangeRate: null, startDate: '2026-01-01',
    clientName: '', clientEmail: '', clientPhone: '', tourName: '', nationality: '',
    itineraryId: null, itineraryCode: null, partnerId: null, partnerName: '',
    ...over,
  }
}

const TIER_INDEX = buildTransportTierIndex(ROUTE_OPTIONS)

function rowAt(result: ReturnType<typeof calculatePaxRange>, pax: number) {
  return result.paxPricing.find(r => r.numPax === pax)!
}

// --- Tests ------------------------------------------------------------------

describe('buildTransportTierIndex', () => {
  it('groups vehicle tiers under their transport rowId', () => {
    expect(TIER_INDEX.has('T1')).toBe(true)
    expect(TIER_INDEX.get('T1')).toHaveLength(3)
  })

  it('skips non-tiered options (no `__` — e.g. cruise transport packages)', () => {
    const idx = buildTransportTierIndex([
      { id: 'PKG1', name: 'Cruise Package', rateEur: 500, rateNonEur: 500 },
    ])
    expect(idx.size).toBe(0)
  })
})

describe('calculatePaxRange — non-linear transport term', () => {
  const result = calculatePaxRange([tripDay()], cfg(), TIER_INDEX, { paxFrom: 1, paxTo: 20 })
  // GroupFixed = guide 120 | PerPerson = 80 (double) + 30 (entrance) = 110 | SingleSupp = 40

  it('2 pax → Sedan (€100): total 440, selling 550, €275pp', () => {
    const r = rowAt(result, 2).withoutLeader
    // 120 + 100 + 110*2 = 440 ; ×1.25 = 550 ; /2 = 275
    expect(r.totalCost).toBe(440)
    expect(r.sellingPrice).toBe(550)
    expect(r.pricePerPerson).toBe(275)
  })

  it('5 pax → re-selects Minivan (€150): total 820, €205pp', () => {
    const r = rowAt(result, 5).withoutLeader
    // 120 + 150 + 110*5 = 820 ; ×1.25 = 1025 ; /5 = 205
    expect(r.totalCost).toBe(820)
    expect(r.pricePerPerson).toBe(205)
  })

  it('10 pax → re-selects Van (€220): total 1440, €180pp', () => {
    const r = rowAt(result, 10).withoutLeader
    // 120 + 220 + 110*10 = 1440 ; ×1.25 = 1800 ; /10 = 180
    expect(r.totalCost).toBe(1440)
    expect(r.pricePerPerson).toBe(180)
  })

  it('20 pax → exceeds every band → largest tier (Van €220): €158.75pp', () => {
    const r = rowAt(result, 20).withoutLeader
    // 120 + 220 + 110*20 = 2540 ; ×1.25 = 3175 ; /20 = 158.75
    expect(r.totalCost).toBe(2540)
    expect(r.pricePerPerson).toBe(158.75)
  })

  it('ignores the originally-selected tier — re-resolves from capacity', () => {
    // Selection stored the Sedan rate, but 8 pax must price the Van.
    expect(rowAt(result, 8).withoutLeader.totalCost).toBe(120 + 220 + 110 * 8)
  })

  it('exposes the whole-tour single supplement once', () => {
    expect(result.singleSupplement).toBe(40)
  })
})

describe('calculatePaxRange — with tour leader (+1 transport seat, single room)', () => {
  const result = calculatePaxRange([tripDay()], cfg(), TIER_INDEX, { paxFrom: 2, paxTo: 2 })

  it('2 pax +leader → transport priced at 3 seats (Minivan €150)', () => {
    const r = rowAt(result, 2).withLeader
    // tourLeaderCost = PerPerson(110) + SingleSupp(40) = 150
    // total = GroupFixed(120) + Transport@3(150) + PerPerson×2(220) + leader(150) = 640
    // selling = 800 ; pp = 800 / 2 = 400  (divided by paying pax, not 3)
    expect(r.tourLeaderCost).toBe(150)
    expect(r.totalCost).toBe(640)
    expect(r.sellingPrice).toBe(800)
    expect(r.pricePerPerson).toBe(400)
  })
})

describe('calculatePaxRange — config dimensions', () => {
  it('non-EUR passport uses the non-EUR rate column', () => {
    const r = rowAt(calculatePaxRange([tripDay()], cfg({ passport: 'non_eu' }), TIER_INDEX, { paxFrom: 2, paxTo: 2 }), 2).withoutLeader
    // GroupFixed 120 | Transport sedan non_eu 110 | PerPerson 90+35=125
    // 120 + 110 + 125*2 = 480 ; ×1.25 = 600 ; /2 = 300
    expect(r.totalCost).toBe(480)
    expect(r.pricePerPerson).toBe(300)
    expect(calculatePaxRange([tripDay()], cfg({ passport: 'non_eu' }), TIER_INDEX, { paxFrom: 2, paxTo: 2 }).singleSupplement).toBe(45)
  })

  it('withGuide=false drops the guide from GroupFixed', () => {
    const r = rowAt(calculatePaxRange([tripDay()], cfg({ withGuide: false }), TIER_INDEX, { paxFrom: 2, paxTo: 2 }), 2).withoutLeader
    // 0 + 100 + 110*2 = 320 ; ×1.25 = 400 ; /2 = 200
    expect(r.totalCost).toBe(320)
    expect(r.pricePerPerson).toBe(200)
  })

  it('honors the paxFrom/paxTo range', () => {
    const r = calculatePaxRange([tripDay()], cfg(), TIER_INDEX, { paxFrom: 4, paxTo: 6 })
    expect(r.paxPricing.map(p => p.numPax)).toEqual([4, 5, 6])
  })
})

describe('calculatePaxRange — non-tiered transport priced flat', () => {
  it('a selection with no `__` (cruise package/custom) stays flat across pax', () => {
    const day: GridDay = {
      ...tripDay(),
      slots: [slot('route', [item({ rateId: 'PKG1', name: 'Cruise Package', rateEur: 500, rateNonEur: 500 })])],
    }
    const result = calculatePaxRange([day], cfg(), TIER_INDEX, { paxFrom: 2, paxTo: 10 })
    // No group/per-person here → totalCost = flat 500 at every pax.
    expect(rowAt(result, 2).withoutLeader.totalCost).toBe(500)
    expect(rowAt(result, 10).withoutLeader.totalCost).toBe(500)
  })
})
