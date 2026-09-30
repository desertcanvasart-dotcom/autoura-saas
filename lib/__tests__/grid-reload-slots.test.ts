import { describe, it, expect } from 'vitest'
import { mapServicesToSlots } from '@/app/pricing-grid/lib/slot-mapping'
import { calculateDay } from '@/app/pricing-grid/lib/calculator'
import type { GridConfig, GridDay } from '@/app/pricing-grid/types'

// ============================================================================
// Reloading a grid-saved itinerary into the Pricing Grid.
// Live 2026-09-30: adding or removing water "changed nothing". The grid's
// save tags each line "[pricing-grid:<slot>] <name>" and stores its rate as
// unit_cost; the reload looked only for a legacy "slot:" tag and read
// rate_eur, which the save never writes. So water (saved as type 'other')
// came back in "Other (Group)" at zero, as did hotel services, boat rides
// and airport services ('transfer').
// ============================================================================

const saved = (slot: string, type: string, name: string, unit: number, extra: Record<string, unknown> = {}) => ({
  id: `svc-${slot}-${name}`, service_type: type, service_name: name, quantity: 2,
  rate_eur: null, rate_non_eur: null, unit_cost: unit, total_cost: unit * 2, notes: null,
  description: `[pricing-grid:${slot}] ${name}`, rate_id: null, ...extra,
})

const slotsOf = (services: ReturnType<typeof saved>[]) => mapServicesToSlots(services, 2)
const slot = (slots: ReturnType<typeof slotsOf>, id: string) => slots.find(s => s.slotId === id)!

describe('reloading grid-saved lines', () => {
  it('each line returns to the slot it was saved from', () => {
    const slots = slotsOf([
      saved('water', 'other', 'Water Bottles', 2),
      saved('hotel_services', 'other', 'Porterage', 5),
      saved('boat_rides', 'other', 'Felucca', 30),
      saved('airport_services', 'transfer', 'Meet & assist', 12),
      saved('entrance_fees', 'entrance_fee', 'Pyramids', 20),
    ])
    expect(slot(slots, 'water').selectedItems.map(i => i.name)).toEqual(['Water Bottles'])
    expect(slot(slots, 'hotel_services').selectedItems.map(i => i.name)).toEqual(['Porterage'])
    expect(slot(slots, 'boat_rides').selectedItems.map(i => i.name)).toEqual(['Felucca'])
    expect(slot(slots, 'airport_services').selectedItems.map(i => i.name)).toEqual(['Meet & assist'])
    expect(slot(slots, 'entrance_fees').selectedItems.map(i => i.name)).toEqual(['Pyramids'])
    expect(slot(slots, 'other_group').selectedItems).toEqual([])
  })

  it('keeps the price it was saved at, and the rate row it came from', () => {
    const slots = slotsOf([saved('entrance_fees', 'entrance_fee', 'Pyramids', 20, { rate_id: 'rate-1' })])
    expect(slot(slots, 'entrance_fees').selectedItems[0]).toMatchObject({ rateId: 'rate-1', rateEur: 20, rateNonEur: 20 })
  })

  it("water matches the grid's water option, so removing it takes its cost off the day", () => {
    const slots = slotsOf([saved('water', 'other', 'Water Bottles', 2), saved('entrance_fees', 'entrance_fee', 'Pyramids', 20)])
    expect(slot(slots, 'water').selectedItems[0].rateId).toBe('water-standard')
    const config = { pax: 2, passport: 'non_eu', withGuide: true, marginPercent: 25 } as unknown as GridConfig
    const day = (s: typeof slots) => ({ slots: s } as unknown as GridDay)
    expect(calculateDay(day(slots), config).perPersonTotal).toBe(22)
    const withoutWater = slots.map(s => (s.slotId === 'water' ? { ...s, selectedItems: [] } : s))
    expect(calculateDay(day(withoutWater), config).perPersonTotal).toBe(20)
  })

  it('a custom amount comes back as the amount', () => {
    const slots = slotsOf([saved('other_pp', 'other', 'custom', 15)])
    expect(slot(slots, 'other_pp')).toMatchObject({ customAmount: 15, selectedItems: [] })
  })

  it('legacy "slot:" notes still work', () => {
    const slots = slotsOf([saved('x', 'other', 'Old', 3, { description: null, notes: 'slot:meals|rate_id:m1', rate_eur: 3, rate_non_eur: 4 })])
    expect(slot(slots, 'meals').selectedItems[0]).toMatchObject({ rateId: 'm1', rateEur: 3, rateNonEur: 4 })
  })
})
