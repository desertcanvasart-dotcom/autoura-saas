// A rate row that names its own currency must be PRICED in that currency.
// Ported from travel-ops-pro: an EGP 150 entrance fee was once priced as if
// it were 150 of the ORG's currency, inflating the offer roughly 50x. This
// pins the CHOICE OF CURRENCY the catalog route makes per item.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { priceCatalogItem, type Converter } from '@/lib/extras-catalog'

const ROOT = join(__dirname, '..', '..')
const ROUTE = readFileSync(join(ROOT, 'app', 'api', 'bookings', '[id]', 'extras', 'catalog', 'route.ts'), 'utf8')

const fx: Converter = (amount, from, to) => {
  if (from === to) return amount
  if (from === 'EGP' && to === 'JPY') return amount * 3
  if (from === 'USD' && to === 'JPY') return amount * 150
  return null
}

describe('extras catalog currency selection', () => {
  it('the route passes the row currency, falling back to the tenant', () => {
    expect(ROUTE).toMatch(/rateCurrency:\s*row\?\.rate_currency\s*\|\|\s*rateCurrency/)
  })
  it('selects rate_currency for the entrance-fee item', () => {
    expect(ROUTE).toMatch(/price\(cost,\s*null,\s*a\)/)
    expect(ROUTE).toMatch(/from\('entrance_fees'\)[\s\S]{0,300}rate_currency/)
  })
  it('an EGP row prices from EGP, not from the tenant currency', () => {
    const asEgp = priceCatalogItem({ cost: 150, marginPercent: 30, rateCurrency: 'EGP', bookingCurrency: 'JPY', convert: fx })
    const asUsd = priceCatalogItem({ cost: 150, marginPercent: 30, rateCurrency: 'USD', bookingCurrency: 'JPY', convert: fx })
    expect(asEgp.supplier_currency).toBe('EGP')
    expect(asEgp.unit_price).toBe(585)
    expect(asUsd.unit_price).toBe(29250)
    expect(asEgp.unit_price!).toBeLessThan(asUsd.unit_price!)
    expect(asEgp.price_note).toMatch(/converted from EGP/)
  })
  it('a row with no currency still uses the tenant rate currency', () => {
    expect(priceCatalogItem({ cost: 100, marginPercent: 30, rateCurrency: 'USD', bookingCurrency: 'JPY', convert: fx }).supplier_currency).toBe('USD')
  })
})
