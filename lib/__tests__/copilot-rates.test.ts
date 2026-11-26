import { describe, it, expect, vi } from 'vitest'
import { buildRatesBlock, paxPriceRuns, publicRateForDate, publicRateLine } from '@/lib/copilot-rates'
import type { calculateAutoPricing } from '@/lib/auto-pricing-service'

// The RATES block the email copilot may quote from (lib/copilot-rates.ts).

/** A Supabase-shaped fake: each table answers with its rows, filtered by eq(). */
function fakeDb(tables: Record<string, Array<Record<string, unknown>>>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => { rows = rows.filter(r => r[col] === val); return q },
        not: (col: string, _op: string, _v: unknown) => { rows = rows.filter(r => r[col] !== null && r[col] !== undefined); return q },
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      }
      return q
    },
  }
}

const BANDS = [
  { minPax: 1, maxPax: 2, perPerson: 95 },
  { minPax: 3, maxPax: 3, perPerson: 82 },
  { minPax: 4, maxPax: 4, perPerson: 74 },
  { minPax: 5, maxPax: 6, perPerson: 66 },
  { minPax: 7, maxPax: 8, perPerson: 61 },
]
const T = 'tenant-1'
const tables = (over: Partial<Record<string, Array<Record<string, unknown>>>> = {}) => ({
  tenants: [{ id: T, default_margin_percent: 25 }],
  tour_templates: [{ id: 'tpl-giza', tenant_id: T, template_name: 'Giza Pyramids & Saqqara Private Day Tour' }],
  publish_pages: [{
    tenant_id: T, tour_template_id: 'tpl-giza', public_rate_approved_at: '2026-11-01T10:00:00Z',
    public_rate: { tier: 'standard', currency: 'EUR', bands: BANDS },
  }],
  ...over,
})

describe('paxPriceRuns / publicRateLine', () => {
  it('joins adjacent identical prices into ranges', () => {
    expect(publicRateLine('EUR', BANDS)).toBe(
      'Public rate, per person, EUR, lowest season: 2 pax 95 · 3 pax 82 · 4 pax 74 · 5–6 pax 66 · 7–8 pax 61',
    )
  })

  it('a single flat price is one range', () => {
    expect(publicRateLine('EUR', [{ minPax: 1, maxPax: 10, perPerson: 50 }])).toBe(
      'Public rate, per person, EUR, lowest season: 2–8 pax 50',
    )
  })

  it('a gap in the bands breaks a range and leaves the size out', () => {
    const runs = paxPriceRuns([{ minPax: 2, maxPax: 3, perPerson: 40 }, { minPax: 5, maxPax: 8, perPerson: 40 }])
    expect(runs).toEqual([{ from: 2, to: 3, price: 40 }, { from: 5, to: 8, price: 40 }])
  })

  it('no size priced = no line', () => {
    expect(publicRateLine('EUR', [{ minPax: 10, maxPax: 20, perPerson: 30 }])).toBeNull()
  })
})

describe('buildRatesBlock', () => {
  it('renders the tour and its approved public rate', async () => {
    const block = await buildRatesBlock(fakeDb(tables()), { tenantId: T, templateIds: ['tpl-giza'] })
    expect(block).toBe(
      'Tour: Giza Pyramids & Saqqara Private Day Tour (template tpl-giza)\n' +
      'Public rate, per person, EUR, lowest season: 2 pax 95 · 3 pax 82 · 4 pax 74 · 5–6 pax 66 · 7–8 pax 61',
    )
  })

  it('skips a tour with no public rate — and never asks the engine instead', async () => {
    const price = vi.fn()
    const block = await buildRatesBlock(fakeDb(tables({ publish_pages: [] })), {
      tenantId: T, templateIds: ['tpl-giza'], travelDate: '2027-03-13', pax: 4, price: price as never,
    })
    expect(block).toBe('')
    expect(price).not.toHaveBeenCalled()
  })

  it('skips a rate that was never approved', async () => {
    const db = fakeDb(tables({ publish_pages: [{ ...tables().publish_pages[0], public_rate_approved_at: null }] }))
    expect(await buildRatesBlock(db, { tenantId: T, templateIds: ['tpl-giza'] })).toBe('')
  })

  it('skips another company\'s tour', async () => {
    expect(await buildRatesBlock(fakeDb(tables()), { tenantId: 'tenant-2', templateIds: ['tpl-giza'] })).toBe('')
  })

  it('adds the date-specific line: the higher of the two nationality figures', async () => {
    const price = vi.fn(async (p: { isEurPassport: boolean }) => ({
      success: true, complete: true, currency: 'EUR', pricePerPerson: p.isEurPassport ? 71 : 78,
    }))
    const block = await buildRatesBlock(fakeDb(tables()), {
      tenantId: T, templateIds: ['tpl-giza'], travelDate: '2027-03-13', pax: 4, price: price as never,
    })
    expect(block.split('\n')[2]).toBe('Date-specific (13 Mar 2027, 4 pax): 78')
    // At the approved rate's tier and the house margin, both bases.
    expect(price).toHaveBeenCalledTimes(2)
    expect(price.mock.calls.map(c => (c[0] as { isEurPassport: boolean }).isEurPassport).sort()).toEqual([false, true])
    expect(price.mock.calls[0][0]).toMatchObject({ tier: 'standard', numPax: 4, travelDate: '2027-03-13', marginPercent: 25 })
  })

  it('leaves the date line out when either basis does not price completely', async () => {
    const price = vi.fn(async (p: { isEurPassport: boolean }) => ({
      success: true, complete: !p.isEurPassport, currency: 'EUR', pricePerPerson: 70,
    }))
    const block = await buildRatesBlock(fakeDb(tables()), {
      tenantId: T, templateIds: ['tpl-giza'], travelDate: '2027-03-13', pax: 4, price: price as never,
    })
    expect(block).not.toContain('Date-specific')
    expect(block).toContain('Public rate')
  })
})

describe('publicRateForDate', () => {
  it('returns the higher figure', async () => {
    const price = (async (p: { isEurPassport: boolean }) => ({
      success: true, complete: true, currency: 'EUR', pricePerPerson: p.isEurPassport ? 120 : 110,
    })) as unknown as typeof calculateAutoPricing
    expect(await publicRateForDate(fakeDb(tables()), { tenantId: T, templateId: 'tpl-giza', tier: 'standard', travelDate: '2027-03-13', pax: 2, price }))
      .toEqual({ perPerson: 120, currency: 'EUR' })
  })
})
