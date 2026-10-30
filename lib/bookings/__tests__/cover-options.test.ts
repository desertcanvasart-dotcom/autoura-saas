import { describe, it, expect } from 'vitest'
import { alternativeCost, ownResourceTypes, sameService, type RateRow } from '@/lib/bookings/cover-options'
import { canTransition } from '@/lib/bookings/service-booking-states'
import { planSupplierExpense } from '@/lib/bookings/supplier-expense'

const guide = (o: Partial<RateRow>): RateRow => ({
  id: 'g', supplier_id: 'amr', city: 'Cairo', guide_type: 'egyptologist', guide_language: 'English',
  tour_duration: 'full_day', guide_mode: 'spot', base_rate_eur: 40, base_rate_non_eur: 40, rate_currency: 'EUR', ...o,
})

describe('who can cover a line directly', () => {
  it('cars and drivers for transport, the airport team for meet-and-assist, guides for guiding', () => {
    expect(ownResourceTypes('transport', 'transportation_rates')).toEqual(['vehicle', 'driver'])
    expect(ownResourceTypes('transport', 'airport_staff_rates')).toEqual(['airport_staff'])
    expect(ownResourceTypes('guide', 'guide_rates')).toEqual(['guide'])
    expect(ownResourceTypes('hotel', 'accommodation_rates')).toEqual([])
    expect(ownResourceTypes('restaurant', 'meal_rates')).toEqual([])
  })
})

describe("another supplier's cost comes from their own rate for the same service", () => {
  const pinned = guide({})

  it('scales the line by their rate: 200 at 40/day → 250 at 50/day', () => {
    const r = alternativeCost('guide_rates', 200, pinned, [guide({ id: 'h', supplier_id: 'hoda', base_rate_eur: 50, base_rate_non_eur: 50 })], 'hoda', '2027-01-02')
    expect(r).toEqual({ ok: true, cost: 250, rateId: 'h' })
  })

  it('the supplier already on the line keeps the line\'s cost', () => {
    expect(alternativeCost('guide_rates', 200, pinned, [], 'amr', null)).toEqual({ ok: true, cost: 200, rateId: 'g' })
  })

  it('no figure — a visible gap — when it is not the same service, not valid that day, or in another currency', () => {
    const cases: Array<[Partial<RateRow>, RegExp]> = [
      [{ guide_language: 'French' }, /no rate from this supplier/],
      [{ rate_valid_to: '2026-12-31' }, /no rate from this supplier/],
      [{ is_active: false }, /no rate from this supplier/],
      [{ rate_currency: 'EGP' }, /another currency/],
      [{ base_rate_non_eur: 60 }, /differ/],
      [{ base_rate_non_eur: null }, /filled in differently/],
    ]
    for (const [o, reason] of cases) {
      const r = alternativeCost('guide_rates', 200, pinned, [guide({ id: 'h', supplier_id: 'hoda', base_rate_eur: 50, base_rate_non_eur: 50, ...o })], 'hoda', '2027-01-02')
      expect(r.ok, JSON.stringify(o)).toBe(false)
      if (!r.ok) expect(r.reason, JSON.stringify(o)).toMatch(reason)
    }
  })

  it('two rates from one supplier that day: refuses to pick', () => {
    const r = alternativeCost('guide_rates', 200, pinned, [guide({ id: 'h1', supplier_id: 'hoda' }), guide({ id: 'h2', supplier_id: 'hoda' })], 'hoda', '2027-01-02')
    expect(r).toEqual({ ok: false, reason: 'this supplier has more than one rate for this service on that day' })
  })

  it('hotels, ships, flights: the supplier is the product — nothing to compare', () => {
    expect(alternativeCost('accommodation_rates', 200, pinned, [], 'x', null).ok).toBe(false)
    expect(alternativeCost(null, 200, pinned, [], 'x', null).ok).toBe(false)
  })

  it('a line with no cost or no priced rate cannot be scaled', () => {
    expect(alternativeCost('guide_rates', null, pinned, [], 'hoda', null).ok).toBe(false)
    expect(alternativeCost('guide_rates', 200, null, [], 'hoda', null).ok).toBe(false)
  })

  it('same service ignores case and blanks', () => {
    expect(sameService('meal_rates', { id: 'a', supplier_id: 'x', city: 'Luxor', meal_type: 'Lunch', tier: null }, { id: 'b', supplier_id: 'y', city: 'luxor ', meal_type: 'lunch', tier: '' })).toBe(true)
  })
})

describe('own people and cars', () => {
  it('a declined or unanswered line can be given to your own team', () => {
    expect(canTransition('declined', 'assigned', 'own').ok).toBe(true)
    expect(canTransition('expired', 'assigned', 'own').ok).toBe(true)
  })

  it('owe no supplier: an assigned own line records no expense', () => {
    const row = { status: 'assigned', confirmed_cost: null, quoted_cost: 80, service_date: '2027-01-02', resource_kind: 'own' }
    expect(planSupplierExpense(row, null, '2026-10-30')).toEqual({ action: 'none' })
    expect(planSupplierExpense(row, { status: 'pending', amount: 80, expense_date: '2027-01-02' }, '2026-10-30')).toEqual({ action: 'remove' })
    expect(planSupplierExpense({ ...row, resource_kind: 'supplier' }, null, '2026-10-30').action).toBe('create')
  })
})

describe('the columns read from each rate sheet exist (generated types)', () => {
  it('every key, figure and validity column is real', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const { SAME_SERVICE_KEYS, rateColumns } = await import('@/lib/bookings/cover-options')
    const types = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'types', 'database.types.ts'), 'utf8')
    for (const t of Object.keys(SAME_SERVICE_KEYS)) {
      const row = new RegExp(`^ {6}${t}: \\{\\n {8}Row: \\{\\n([\\s\\S]*?)\\n {8}\\}`, 'm').exec(types)?.[1] ?? ''
      for (const c of rateColumns(t).split(', ')) expect(row, `${t}.${c}`).toMatch(new RegExp(`^ {10}${c}\\??:`, 'm'))
    }
  })
})
