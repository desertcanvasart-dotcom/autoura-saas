import { describe, it, expect } from 'vitest'
import { hydrateDayRates, WATER_CUSTOM_ID } from '@/app/pricing-grid/lib/hydrate-rates'
import { calculateDay } from '@/app/pricing-grid/lib/calculator'
import type { AllRates, GridConfig, GridDay, SlotValue } from '@/app/pricing-grid/types'

// ============================================================================
// Live 2026-09-30, ITN-S-2026-6476 day 1: Marriott Mena House selected (the
// dropdown showing 175.89) while the day added 0.00 for it; the Water row
// showing 2.00 while the day added 1.00 — a hidden custom amount the AI
// parser put on every day, which the calculator preferred over the row's
// choice. So adding or removing water changed nothing, and the quote went
// out without its hotels.
// ============================================================================

const rates = {
  accommodation: [{ id: 'mena', name: 'Marriott Mena House', rateEur: 175.89, rateNonEur: 190 }],
  water: [{ id: 'water-standard', name: 'Water Bottles', rateEur: 2, rateNonEur: 2 }],
} as unknown as AllRates

const slot = (slotId: string, extra: Partial<SlotValue> = {}): SlotValue => ({ slotId, selectedItems: [], customAmount: 0, ...extra })
const day = (...slots: SlotValue[]) => ({ id: 'd1', dayNumber: 1, title: '', city: 'Cairo', description: '', isExpanded: false, slots } as GridDay)
const config = { pax: 2, passport: 'eu', withGuide: true, marginPercent: 12 } as unknown as GridConfig
const find = (d: GridDay, id: string) => d.slots.find(s => s.slotId === id)!

describe('hydrateDayRates', () => {
  it('a hotel that arrived at 0 takes the rate list’s price, and the day counts it', () => {
    const d = day(slot('accommodation', { selectedItems: [{ rateId: 'mena', name: 'Marriott', rateEur: 0, rateNonEur: 0 }] }))
    expect(calculateDay(d, config).perPersonTotal).toBe(0)
    const { days, changed } = hydrateDayRates([d], rates, 'missing')
    expect(changed).toBe(1)
    expect(find(days[0], 'accommodation').selectedItems[0]).toMatchObject({ rateEur: 175.89, rateNonEur: 190 })
    expect(calculateDay(days[0], config).perPersonTotal).toBe(175.89)
  })

  it("'missing' never moves a price that was saved", () => {
    const d = day(slot('accommodation', { selectedItems: [{ rateId: 'mena', name: 'Marriott', rateEur: 150, rateNonEur: 160 }] }))
    const { days, changed } = hydrateDayRates([d], rates, 'missing')
    expect(changed).toBe(0)
    expect(days[0]).toBe(d)
  })

  it("'all' (a fresh AI parse) takes the rate list's price even over the parser's own", () => {
    const d = day(slot('accommodation', { selectedItems: [{ rateId: 'mena', name: 'Marriott', rateEur: 120, rateNonEur: 120 }] }))
    const { days } = hydrateDayRates([d], rates, 'all')
    expect(find(days[0], 'accommodation').selectedItems[0].rateEur).toBe(175.89)
  })

  it('hidden water becomes a visible Water item: its own amount on a draft, the company rate after a parse', () => {
    const hidden = day(slot('water', { customAmount: 1 }))
    const kept = hydrateDayRates([hidden], rates, 'missing').days[0]
    expect(find(kept, 'water')).toMatchObject({
      customAmount: 0, selectedItems: [{ rateId: WATER_CUSTOM_ID, name: 'Water Bottles', rateEur: 1, rateNonEur: 1 }],
    })
    expect(calculateDay(kept, config).perPersonTotal).toBe(1)

    const parsed = hydrateDayRates([hidden], rates, 'all').days[0]
    expect(find(parsed, 'water').selectedItems[0]).toMatchObject({ rateId: 'water-standard', rateEur: 2 })
  })

  it('the parser’s unpriced water item takes the company water rate', () => {
    const d = day(slot('water', { selectedItems: [{ rateId: 'water-standard', name: 'Water Bottles', rateEur: 0, rateNonEur: 0 }] }))
    const out = hydrateDayRates([d], rates, 'all').days[0]
    expect(calculateDay(out, config).perPersonTotal).toBe(2)
  })

  it('once water is a visible item, removing it takes its cost off the day', () => {
    const out = hydrateDayRates([day(slot('water', { customAmount: 1 }))], rates, 'missing').days[0]
    const removed = { ...out, slots: out.slots.map(s => (s.slotId === 'water' ? { ...s, selectedItems: [] } : s)) }
    expect(calculateDay(removed, config).perPersonTotal).toBe(0)
  })

  it('an item not in the rate list is left alone', () => {
    const d = day(slot('accommodation', { selectedItems: [{ rateId: 'gone', name: 'Old hotel', rateEur: 0, rateNonEur: 0 }] }))
    expect(hydrateDayRates([d], rates, 'all').changed).toBe(0)
  })
})

// The save writes the single supplement only for a party of one, so a 2-pax
// trip reloads its hotel alone. The grid keeps the supplement for any party
// (the B2B sheet's tour leader; a later switch to 1 pax), so it comes back.
describe('hydrateDayRates — the single supplement', () => {
  const suppRates = {
    accommodation: [{ id: 'mena', name: 'Mena House', rateEur: 100, rateNonEur: 110, single_supp_eur: 60, single_supp_non_eur: 65 }],
  } as unknown as AllRates
  const hotel = { rateId: 'mena', name: 'Mena House', rateEur: 100, rateNonEur: 110 }

  it('a hotel reloaded without its supplement takes it back; 2 pax still pays only the double rate', () => {
    const d = day(slot('accommodation', { selectedItems: [hotel] }))
    const { days, changed } = hydrateDayRates([d], suppRates, 'missing')
    expect(changed).toBe(1)
    expect(find(days[0], 'accommodation').selectedItems).toEqual([
      hotel,
      { rateId: 'mena_supp', name: 'Single Supplement', rateEur: 60, rateNonEur: 65 },
    ])
    expect(calculateDay(days[0], config).perPersonTotal).toBe(100)
    expect(calculateDay(days[0], { ...config, pax: 1 } as GridConfig).perPersonTotal).toBe(160)
  })

  it('a hotel that already has its supplement is left alone', () => {
    const d = day(slot('accommodation', { selectedItems: [hotel, { rateId: 'x', name: 'Single Supplement', rateEur: 60, rateNonEur: 65 }] }))
    expect(hydrateDayRates([d], suppRates, 'missing').changed).toBe(0)
  })
})
