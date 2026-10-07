import { describe, it, expect } from 'vitest'
import { calculateDay, calculatePaxRange, buildTransportTierIndex } from '@/app/pricing-grid/lib/calculator'
import { hydrateDayRates } from '@/app/pricing-grid/lib/hydrate-rates'
import type { AllRates, GridConfig, GridDay, SelectedItem, SlotValue } from '@/app/pricing-grid/types'

// ============================================================================
// The Pricing Grid prices airport / hotel services and activities by each
// rate's own basis (migration 393, activity_rates.pricing_type) — not by the
// row they sit in. An item that states none keeps its row's rule.
// ============================================================================

const item = (rate: number, extra: Partial<SelectedItem> = {}): SelectedItem =>
  ({ rateId: `r${rate}`, name: `R${rate}`, rateEur: rate, rateNonEur: rate, ...extra })
const slot = (slotId: string, items: SelectedItem[]): SlotValue => ({ slotId, selectedItems: items, customAmount: 0 })
const day = (...slots: SlotValue[]) => ({ id: 'd', dayNumber: 1, title: '', city: 'Aswan', description: '', isExpanded: false, slots } as GridDay)
const config = (pax: number) => ({ pax, passport: 'eu', withGuide: true, marginPercent: 0 } as unknown as GridConfig)

describe('calculateDay by basis', () => {
  it('a per-person airport assist is charged per traveller', () => {
    const d = day(slot('airport_services', [item(700, { pricingBasis: 'per_person' })]))
    expect(calculateDay(d, config(4))).toMatchObject({ groupTotal: 0, perPersonTotal: 700, dailyTotal: 2800 })
  })

  it('a per-group assist stays once for the group — and so does one with no basis', () => {
    for (const it of [item(700, { pricingBasis: 'flat' }), item(700)]) {
      expect(calculateDay(day(slot('airport_services', [it])), config(4)).dailyTotal).toBe(700)
    }
  })

  it('a per-unit hotel service is charged per unit the group needs', () => {
    const d = day(slot('hotel_services', [item(50, { pricingBasis: 'per_unit', unitCapacity: 2 })]))
    expect(calculateDay(d, config(5)).dailyTotal).toBe(150)
  })

  it('an experience priced per group is charged once, not per person', () => {
    const flat = day(slot('experiences', [item(300, { pricingBasis: 'flat' })]))
    expect(calculateDay(flat, config(3)).dailyTotal).toBe(300)
    // No basis: the row's rule (experiences are per person).
    expect(calculateDay(day(slot('experiences', [item(30)])), config(3)).dailyTotal).toBe(90)
  })
})

describe('the B2B sheet across group sizes', () => {
  it('per person scales, per unit steps, per group stays', () => {
    const d = day(
      slot('airport_services', [item(10, { pricingBasis: 'per_person' })]),
      slot('hotel_services', [item(40, { pricingBasis: 'per_unit', unitCapacity: 2 })]),
      slot('boat_rides', [item(100, { pricingBasis: 'flat' })]),
    )
    const sheet = calculatePaxRange([d], config(2), buildTransportTierIndex([]), { paxFrom: 1, paxTo: 3 })
    const total = (pax: number) => sheet.paxPricing.find(p => p.numPax === pax)!.withoutLeader.totalCost
    // 1 pax: 10 + 40×1 + 100 = 150 · 2 pax: 20 + 40 + 100 = 160 · 3 pax: 30 + 80 + 100 = 210
    expect([1, 2, 3].map(total)).toEqual([150, 160, 210])
  })
})

describe('a reloaded or parsed item takes its rate’s basis', () => {
  it('without moving its saved price', () => {
    const rates = { airport_services: [{ id: 'a1', name: 'ASW', rateEur: 800, rateNonEur: 800, pricing_basis: 'per_person', unit_capacity: null }] } as unknown as AllRates
    const d = day(slot('airport_services', [{ rateId: 'a1', name: 'ASW', rateEur: 700, rateNonEur: 700 }]))
    const out = hydrateDayRates([d], rates, 'missing').days[0].slots[0].selectedItems[0]
    expect(out).toMatchObject({ rateEur: 700, pricingBasis: 'per_person' })
  })
})
