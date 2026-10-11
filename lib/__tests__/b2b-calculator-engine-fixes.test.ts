import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { withProgrammeOptions, type PriceCalculationResult } from '@/lib/b2b/price-variation'
import { withSeason } from '@/lib/auto-pricing-service'
import { optionalContribution } from '@/lib/b2b/optional-pricing'

const ROOT = path.join(__dirname, '..', '..')
const ENGINE = readFileSync(path.join(ROOT, 'lib', 'auto-pricing-service.ts'), 'utf8')
const B2B = readFileSync(path.join(ROOT, 'lib', 'b2b', 'price-variation.ts'), 'utf8')

const base = (over: Partial<PriceCalculationResult> = {}): PriceCalculationResult => ({
  variation_id: 'v1', variation_name: 'Classic', template_name: 'Cairo', num_pax: 2,
  travel_date: '2026-12-24', season: 'high', is_eur_passport: false, tour_leader_included: false,
  services: [], optional_services: [], subtotal_cost: 1000, optional_total: 0, total_cost: 1000,
  tour_leader_cost: 0, margin_percent: 25, margin_amount: 250, selling_price: 1250, price_per_person: 625,
  single_supplement: 0, currency: 'EUR', complete: true, holes: [], warnings: [],
  ...over,
} as PriceCalculationResult)

// A day-built programme given one option in Tour Manager fell into the rows
// path with only that option to price — and came out at 0.
describe('B2B Calculator — options on a day-built programme', () => {
  it('the engine prices a programme whose only rows are options', () => {
    expect(B2B).toContain('const useEngine = !!templateId && !variationRows.some((s) => !s.is_optional)')
    expect(B2B).toContain('data: foldExtras(withProgrammeOptions(result, optionalServices, chosenOptionals, effectiveMargin, holes), extrasCatalogue, extraSelections)')
    expect(B2B).not.toContain('if ((!services || services.length === 0) && templateId)')
  })

  it('a chosen option is added on top of the engine price, cost plus margin', () => {
    const chosen = [optionalContribution({ lineTotal: 100, override: null, quantity: 2 })]
    const r = withProgrammeOptions(base(), [{ service_name: 'Balloon' } as never], chosen, 25, [])
    expect(r.total_cost).toBe(1100)
    expect(r.margin_amount).toBe(275)
    expect(r.selling_price).toBe(1375)
    expect(r.price_per_person).toBe(687.5)
    expect(r.optional_total).toBe(125)
    expect(r.optional_services).toHaveLength(1)
  })

  it('an operator-priced option is added after margin; an unchosen one adds nothing', () => {
    const chosen = [optionalContribution({ lineTotal: 100, override: 90, quantity: 2 })]
    const r = withProgrammeOptions(base(), [{} as never, {} as never], chosen, 25, [])
    expect(r.total_cost).toBe(1100)
    expect(r.margin_amount).toBe(250)
    expect(r.selling_price).toBe(1430)
    expect(withProgrammeOptions(base(), [{} as never], [], 25, []).selling_price).toBe(1250)
  })

  it('an option with no price is a hole', () => {
    const r = withProgrammeOptions(base(), [{} as never], [], 25, [{ kind: 'option', message: 'x' }])
    expect(r.complete).toBe(false)
  })
})

describe('B2B Calculator — the engine', () => {
  it('prices a group larger than 40 at its own size', () => {
    expect(ENGINE).toContain('paxTo: Math.max(PAX_COUNTS[PAX_COUNTS.length - 1], Math.floor(Number(requestedPax) || 0))')
  })

  it('declares the tenant’s run currency, not EUR', () => {
    expect(ENGINE).toContain('currency: await getTenantRunCurrency(getSupabaseAdmin(), catalogScope.tenantId),')
  })

  it('the seasonal premium is margin, and in every rate-sheet row', () => {
    const season = { name: 'Christmas', upliftPercent: 10 } as never
    const b = withSeason({ totalCost: 800, marginAmount: 200, sellingPrice: 1000, pricePerPerson: 500 }, 2, season)
    expect(b).toEqual({ totalCost: 800, marginAmount: 300, sellingPrice: 1100, pricePerPerson: 550 })
    const plain = { totalCost: 800, marginAmount: 200, sellingPrice: 1000, pricePerPerson: 500 }
    expect(withSeason(plain, 2, null)).toBe(plain)
    expect(ENGINE).toContain('marginAmount: Math.round((pricing.marginAmount + upliftAmount) * 100) / 100,')
    expect(ENGINE).toContain('    paxPricingTable,\n')
  })
})
