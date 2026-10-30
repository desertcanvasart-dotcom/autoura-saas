import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { supplierCurrencyFields, recordSupplierCurrency } from '@/lib/pricing/line-supplier-currency'
import { ownCostIsCurrent, supplierOwnMoney } from '@/lib/supplier-own-currency'
import { computeFxReprice } from '@/lib/itinerary-fx'

describe('a priced line records what the supplier is paid, in their currency', () => {
  it('EGP guide on a EUR trip: original per unit = unit cost ÷ rate', () => {
    // 1 EGP = 0.02 EUR; the grid priced the guide at EUR 60
    expect(supplierCurrencyFields(60, 'EGP', 'EUR', 0.02)).toEqual({ supplier_currency: 'EGP', supplier_cost_original: 3000, exchange_rate_used: 0.02 })
  })
  it('a rate already in the trip currency: itself at rate 1', () => {
    expect(supplierCurrencyFields(50, 'eur', 'EUR', null)).toEqual({ supplier_currency: 'EUR', supplier_cost_original: 50, exchange_rate_used: 1 })
  })
  it('never guessed: no currency, no exchange rate, or no cost → nothing', () => {
    expect(supplierCurrencyFields(60, null, 'EUR', 0.02)).toBeNull()
    expect(supplierCurrencyFields(60, 'EGP', 'EUR', null)).toBeNull()
    expect(supplierCurrencyFields(0, 'EGP', 'EUR', 0.02)).toBeNull()
  })
  it('what it records is what the own-currency rule and the FX reprice need — consistent by construction', () => {
    const line = { quantity: 2, unit_cost: 60, total_cost: 120, ...supplierCurrencyFields(60, 'EGP', 'EUR', 0.02)! }
    expect(ownCostIsCurrent(line)).toBe(true)
    expect(supplierOwnMoney([line], 'EUR')).toMatchObject({ currency: 'EGP', total: 6000, own: true })
    // repriced at the same 1 EUR = 50 EGP, it lands back on the same cost
    const fx = computeFxReprice([{ id: 'l1', ...line }], [{ base_currency: 'EUR', target_currency: 'EGP', rate: 50, is_active: true }], 'EUR')
    expect(fx.skipped).toEqual([])
    expect(fx.patches).toEqual([{ id: 'l1', unit_cost: 60, total_cost: 120, exchange_rate_used: 0.02 }])
  })
})

describe('the grid save fills them from each line’s pinned rate row', () => {
  it('reads that table’s rate_currency for this company, converts once per currency, and fills only pinned lines', async () => {
    const reads: Array<{ table: string; ids: string[]; tenant: string }> = []
    const db = {
      from: (table: string) => {
        if (table === 'exchange_rates') {
          return { select: () => ({ eq: async () => ({ data: [{ tenant_id: null, base_currency: 'EUR', target_currency: 'EGP', rate: 50, is_active: true }], error: null }) }) }
        }
        let ids: string[] = []
        const q = {
          select: () => q,
          in: (_c: string, v: string[]) => { ids = v; return q },
          eq: async (_c: string, tenant: string) => { reads.push({ table, ids, tenant }); return { data: ids.map(id => ({ id, rate_currency: 'EGP' })), error: null } },
        }
        return q
      },
    }
    const lines: Array<Record<string, unknown>> = [
      { unit_cost: 60, quantity: 1, total_cost: 60, rate_table: 'guide_rates', rate_id: 'g1' },
      { unit_cost: 10, quantity: 1, total_cost: 10 },
      { unit_cost: 5, quantity: 1, total_cost: 5, rate_table: 'not_a_rate_table', rate_id: 'x' },
    ]
    await recordSupplierCurrency(db as never, 't1', 'EUR', lines)
    expect(reads).toEqual([{ table: 'guide_rates', ids: ['g1'], tenant: 't1' }])
    expect(lines[0]).toMatchObject({ supplier_currency: 'EGP', supplier_cost_original: 3000, exchange_rate_used: 0.02 })
    expect(lines[1]).not.toHaveProperty('supplier_currency')
    expect(lines[2]).not.toHaveProperty('supplier_currency')
  })

  it('the save route calls it before writing, in the run currency', () => {
    const r = readFileSync('app/api/pricing-grid/save/route.ts', 'utf8')
    expect(r.indexOf('await recordSupplierCurrency(')).toBeLessThan(r.indexOf(".rpc('save_pricing_grid_days'"))
    expect(r).toContain('tenant_id, recordCurrency,')
  })
})
