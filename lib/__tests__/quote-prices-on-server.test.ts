import { vi, describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { priceB2cQuote, b2cPriceInputError } from '@/lib/quotes/b2c-quote-price'
import { rateSheetFromPaxTable } from '@/lib/quotes/calculator-pricing-table'

// ============================================
// Quote prices are worked out on the server (operator decision, 2026-10-11):
// the browser sends what a price is calculated FROM, never the price.
// ============================================

const src = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')

// --- the calculator save, with the engine and the database stubbed ---------
const priceVariation = vi.fn()
vi.mock('@/lib/b2b/price-variation', () => ({ priceVariation: (...a: unknown[]) => priceVariation(...a) }))
vi.mock('@/lib/quotes/partner-in-tenant', () => ({ partnerInTenant: async () => ({ ok: true }) }))
let inserted: Record<string, unknown> | null = null
vi.mock('@/lib/supabase-server', () => {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  Object.assign(chain, {
    select: self, eq: self,
    maybeSingle: async () => ({ data: { variation_name: 'Classic', tour_templates: { template_name: 'Nile' } } }),
    insert: (row: Record<string, unknown>) => { inserted = row; return chain },
    single: async () => ({ data: { id: 'q1', quote_number: 'B2B-1', ...inserted }, error: null }),
  })
  return {
    requireAuth: async () => ({ error: null, tenant_id: 't1', role: 'manager', user: { id: 'u1' } }),
    createAdminClient: () => ({ from: () => chain, rpc: async () => ({ data: 'B2B-1' }) }),
  }
})

import { POST } from '@/app/api/b2b/quotes/route'

const engineResult = {
  variation_id: 'v1', num_pax: 4, travel_date: '2026-12-20', season: 'high', is_eur_passport: true,
  tour_leader_included: false, services: [
    { service_name: 'Hotel', line_total: 800 },
    { service_name: 'Lunch in hotel', line_total: 0, included: true },
  ],
  optional_services: [{ service_name: 'Balloon', is_selected: true }, { service_name: 'Show', is_selected: false }],
  total_cost: 1000, margin_percent: 25, margin_amount: 250, selling_price: 1250, price_per_person: 312.5,
  tour_leader_cost: 0, single_supplement: 120, currency: 'EUR', complete: true, holes: [],
  pax_pricing_table: [
    { numPax: 2, withoutLeader: { sellingPrice: 900, pricePerPerson: 450 }, withLeader: { sellingPrice: 1000, pricePerPerson: 500 } },
    { numPax: 11, withoutLeader: { sellingPrice: 1, pricePerPerson: 1 }, withLeader: { sellingPrice: 1, pricePerPerson: 1 } },
  ],
}

const save = (body: unknown) => POST(new NextRequest('http://x/api/b2b/quotes', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => { inserted = null; priceVariation.mockReset() })

describe('the B2B calculator save', () => {
  it('prices the inputs again and stores the server’s figures, not the body’s', async () => {
    priceVariation.mockResolvedValue({ status: 200, body: { success: true, data: engineResult } })
    const res = await save({
      variation_id: 'v1',
      // '' = the agency's first guide grade (the calculator's default).
      pricing: { num_pax: 4, margin_percent: 25, guide_grade: '', guide_mode: 'spot' },
      include_rate_sheet: true,
      // A tampered request: none of these may reach the quote.
      selling_price: 1, price_per_person: 1, total_cost: 1, services_snapshot: [{ x: 1 }],
      rate_sheet: [{ pax: 2, pp: 1, total: 2 }],
    })
    expect(res.status).toBe(201)
    expect(priceVariation).toHaveBeenCalledWith('t1', expect.objectContaining({ variation_id: 'v1', num_pax: 4, margin_percent: 25 }))
    expect(inserted).toMatchObject({
      total_cost: 1000, selling_price: 1250, price_per_person: 312.5, margin_amount: 250,
      num_adults: 4, num_children: 0, single_supplement: 120, currency: 'EUR', season: 'high',
      guide_grade: null, guide_mode: null,
      pricing_table: { '2': { pp: 450, total: 900 }, '4': { pp: 312.5, total: 1250 } },
    })
    // The bookable lines and the chosen option, from the engine.
    expect((inserted!.services_snapshot as Array<{ service_name: string }>).map(s => s.service_name)).toEqual(['Hotel', 'Balloon'])
  })

  it('stores a grade the operator chose — any of the agency\'s, not only senior', async () => {
    priceVariation.mockResolvedValue({ status: 200, body: { success: true, data: engineResult } })
    await save({ variation_id: 'v1', pricing: { num_pax: 4, margin_percent: 25, guide_grade: 'lecturer', guide_mode: 'spot' } })
    expect(inserted).toMatchObject({ guide_grade: 'lecturer' })
  })

  it('without a calculation, or when it fails, nothing is saved', async () => {
    expect((await save({ variation_id: 'v1', selling_price: 1250, total_cost: 1000 })).status).toBe(400)
    priceVariation.mockResolvedValue({ status: 404, body: { error: 'Variation not found' } })
    const res = await save({ variation_id: 'v1', pricing: { num_pax: 2 } })
    expect(res.status).toBe(404)
    expect(inserted).toBeNull()
  })

  it('the page sends the inputs of the price on screen, and says when rates moved', () => {
    const page = src('app/b2b/calculator/[id]/page.tsx')
    expect(page).toContain('pricing: pricedInputs,')
    expect(page).not.toContain('selling_price: result.selling_price')
    expect(page).not.toContain('rate_sheet: rateSheet.map')
    expect(page).toContain('Rates changed since this price was calculated')
    expect(src('app/api/b2b/calculate-price/route.ts')).toContain('await priceVariation(authResult.tenant_id, body)')
  })
})

describe('the rate sheet a calculator quote stores', () => {
  it('comes from the engine’s pax table, up to 10 people, with or without the leader', () => {
    expect(rateSheetFromPaxTable(engineResult.pax_pricing_table, false)).toEqual([{ pax: 2, pp: 450, total: 900 }])
    expect(rateSheetFromPaxTable(engineResult.pax_pricing_table, true)).toEqual([{ pax: 2, pp: 500, total: 1000 }])
    expect(rateSheetFromPaxTable(undefined, false)).toEqual([])
  })
})

describe('a B2C quote’s price', () => {
  it('is in the currency’s units', () => {
    expect(priceB2cQuote({ totalCost: 80000, marginPercent: 25, travelers: 3, currency: 'JPY' }))
      .toEqual({ selling_price: 100000, price_per_person: 33333, season_premium: 0 })
    expect(priceB2cQuote({ totalCost: 1000, marginPercent: 20, travelers: 3, currency: 'EUR' }))
      .toEqual({ selling_price: 1200, price_per_person: 400, season_premium: 0 })
    expect(priceB2cQuote({ totalCost: 1000, marginPercent: 0, travelers: 0, currency: null }))
      .toEqual({ selling_price: 1000, price_per_person: 1000, season_premium: 0 })
  })

  it('needs a positive cost and a margin in range — 0% is a margin', () => {
    expect(b2cPriceInputError(1000, 0)).toBeNull()
    expect(b2cPriceInputError(0, 25)).toMatch(/base cost/)
    expect(b2cPriceInputError(1000, 500)).toMatch(/margin/)
    expect(b2cPriceInputError(1000, 'x')).toMatch(/margin/)
  })

  it('the edit route never takes the price from the body; the page previews the same figure', () => {
    const put = src('app/api/quotes/b2c/[id]/route.ts')
    expect(put).not.toMatch(/selling_price !== undefined|price_per_person !== undefined/)
    expect(put).toContain('Object.assign(updateData, priceB2cQuote({')
    expect(src('app/quotes/b2c/[id]/edit/page.tsx')).toContain('priceB2cQuote({ totalCost, marginPercent, travelers: numTravelers, currency, seasonPercent })')
    expect(src('app/api/quotes/b2c/from-itinerary/route.ts')).toContain('const { selling_price, price_per_person, season_premium } = priceB2cQuote({')
  })
})

describe('a B2B quote edit', () => {
  it('cannot set the partner’s price table', () => {
    expect(src('app/api/quotes/b2b/[id]/route.ts')).not.toContain('updateData.pricing_table')
  })
})
