import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { GridDay, RateOption } from '@/app/pricing-grid/types'
import { repriceGridDays, repriceWarnings } from '@/lib/pricing/grid-reprice'
import { groupVehicleRowsToTiers } from '@/lib/pricing/grid-rates'
import { mapServicesToSlots } from '@/app/pricing-grid/lib/slot-mapping'

// ============================================
// A grid save prices every pick from the rates as they are at the save
// (operator decision, 2026-10-11) — never from the figure the browser holds.
// ============================================

const src = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')
const item = (rateId: string, name: string, eur: number, nonEur = eur) => ({ rateId, name, rateEur: eur, rateNonEur: nonEur })
const opt = (id: string, eur: number, nonEur = eur, extra: Partial<RateOption> = {}): RateOption =>
  ({ id, name: id, rateEur: eur, rateNonEur: nonEur, ...extra })
const day = (slots: Array<{ slotId: string; items: ReturnType<typeof item>[] }>): GridDay => ({
  id: 'd1', dayNumber: 1, title: '', city: '', description: '', isExpanded: false,
  slots: slots.map(s => ({ slotId: s.slotId, selectedItems: s.items, customAmount: 0 })),
})
const items = (d: GridDay, slotId: string) => d.slots.find(s => s.slotId === slotId)!.selectedItems

describe('repriceGridDays', () => {
  it('each pick takes its rate’s price, basis and tip role now', () => {
    const { days, repriced, kept } = repriceGridDays(
      [day([
        { slotId: 'entrance_fees', items: [item('e1', 'Pyramids', 10, 20)] },
        { slotId: 'airport_services', items: [item('a1', 'Meet & assist', 30)] },
        { slotId: 'tipping', items: [item('t1', 'Guide tip', 5)] },
      ])],
      {
        entrance_fees: [opt('e1', 12, 24)],
        airport_services: [opt('a1', 30, 30, { pricing_basis: 'per_unit', unit_capacity: 4 })],
        tipping: [opt('t1', 5, 5, { tip_role: 'guide' })],
      },
    )
    expect(items(days[0], 'entrance_fees')[0]).toMatchObject({ rateEur: 12, rateNonEur: 24 })
    expect(items(days[0], 'airport_services')[0]).toMatchObject({ pricingBasis: 'per_unit', unitCapacity: 4 })
    expect(items(days[0], 'tipping')[0]).toMatchObject({ tipRole: 'guide' })
    expect(repriced).toEqual([{ dayNumber: 1, slotId: 'entrance_fees', name: 'Pyramids', from: { eur: 10, nonEur: 20 }, to: { eur: 12, nonEur: 24 } }])
    expect(kept).toEqual([])
  })

  it('finds a vehicle by its own row, and a hotel’s single supplement by the hotel', () => {
    const route = groupVehicleRowsToTiers([
      { id: 'r1', service_type: 'day_tour', city: 'Cairo', vehicle_type: 'sedan', base_rate_eur: 50, created_at: '1' },
      { id: 'r2', service_type: 'day_tour', city: 'Cairo', vehicle_type: 'van', base_rate_eur: 90, created_at: '2' },
    ]) as RateOption[]
    const { days } = repriceGridDays(
      [day([
        { slotId: 'route', items: [item('r2', 'Van', 70)] },
        { slotId: 'accommodation', items: [item('h1', 'Mena', 100), item('h1_supp', 'Single Supplement', 40)] },
      ])],
      { route, accommodation: [opt('h1', 110, 120, { single_supp_eur: 60, single_supp_non_eur: 65 })] },
    )
    expect(items(days[0], 'route')[0]).toMatchObject({ rateId: 'r1__van', rateEur: 90 })
    expect(items(days[0], 'accommodation')).toMatchObject([{ rateEur: 110, rateNonEur: 120 }, { rateEur: 60, rateNonEur: 65 }])
  })

  it('a pick with no rate on file keeps its price and is reported; typed water is the operator’s', () => {
    const { days, kept, repriced } = repriceGridDays(
      [day([
        { slotId: 'meals', items: [item('gone', 'Old lunch', 15)] },
        { slotId: 'water', items: [item('water-custom', 'Water Bottles', 2)] },
      ])],
      { meals: [opt('m1', 20)], water: [opt('water-standard', 1)] },
    )
    expect(items(days[0], 'meals')[0].rateEur).toBe(15)
    expect(items(days[0], 'water')[0].rateEur).toBe(2)
    expect(kept).toEqual([{ dayNumber: 1, slotId: 'meals', name: 'Old lunch' }])
    expect(repriced).toEqual([])
  })

  it('the save says what moved, at the passport the trip is priced at, and what was kept', () => {
    const moved = [{ dayNumber: 2, slotId: 'meals', name: 'Lunch', from: { eur: 10, nonEur: 10 }, to: { eur: 12, nonEur: 10 } }]
    expect(repriceWarnings(moved, [], 'eu')[0]).toContain('Lunch (day 2): 10 → 12')
    expect(repriceWarnings(moved, [], 'non_eu')).toEqual([])
    expect(repriceWarnings([], [{ dayNumber: 1, slotId: 'meals', name: 'Old lunch' }], 'eu')[0]).toContain('Old lunch (day 1)')
  })
})

describe('where the grid’s prices come from', () => {
  it('the save prices from the rates and its own engine — never the browser’s totals', () => {
    const save = src('app/api/pricing-grid/save/route.ts')
    expect(save).toContain('const sized = repickVehicles(body.days as GridDay[], routeOptions, pax)')
    expect(save).toContain('const priced = repriceGridDays(sized,')
    expect(save).toContain('const totals = calculateGrandTotals(days, gridConfig, { throughoutGroupExtraEur: throughout.totalEur })')
    expect(save).not.toContain('totals?.sellingPriceTotal')
    expect(save).not.toContain('body.throughout_extras')
    // A rate with no pinnable row keeps its id where the reload reads it.
    expect(save).toContain("const idNote = !('rate_id' in pin) && item.rateId ? ` |rate_id:${item.rateId}` : ''")
  })

  it('the page sends its picks only, and shows today’s rates after a save that moved them', () => {
    const page = src('app/pricing-grid/page.tsx')
    expect(page).toContain('body: JSON.stringify({ config, days })')
    expect(page).toContain("if (data.repricedLines > 0) fetchRates(config.tier, config.startDate, 'all')")
    // Only a dropped office address clears the client's email — not every warning.
    expect(page).toContain('...(data.clientEmailDropped ? { clientEmail: \'\' } : {}),')
  })

  it('the dropdowns and the save read the same rate lists', () => {
    expect(src('app/api/pricing-grid/rates/route.ts')).toContain('await loadGridRates(authResult.supabase')
  })
})

describe('a reloaded transport line', () => {
  it('reads its rate id back from the description, so a re-save prices it again', () => {
    const slots = mapServicesToSlots([{
      id: 'svc-1', service_type: 'transportation', service_name: 'Van — Cairo',
      quantity: 1, rate_eur: null, rate_non_eur: null, total_cost: 90, unit_cost: 90, rate_id: null,
      description: '[pricing-grid:route] Van — Cairo |rate_id:r1__van',
    }], 2)
    expect(slots.find(s => s.slotId === 'route')!.selectedItems[0]).toMatchObject({ rateId: 'r1__van', rateEur: 90 })
  })
})
