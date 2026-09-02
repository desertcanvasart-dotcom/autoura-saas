// Ported verbatim from travel-ops-pro (__tests__/lib/extras-catalog.test.ts).
import { describe, it, expect } from 'vitest'
import { priceCatalogItem, entranceFeeBasis, type Converter } from '@/lib/extras-catalog'

const usdToJpy: Converter = (amount, from, to) => (from === 'USD' && to === 'JPY' ? amount * 150 : null)
const noRates: Converter = () => null
const base = { marginPercent: 25, rateCurrency: 'EUR', bookingCurrency: 'EUR', convert: noRates }

describe('priceCatalogItem', () => {
  it('applies the tenant margin to the cost', () => {
    const r = priceCatalogItem({ ...base, cost: 100 })
    expect(r.supplier_cost).toBe(100); expect(r.unit_price).toBe(125); expect(r.price_note).toBe('cost + 25% margin')
  })
  it('prefers the selling price the operator already set', () => {
    const r = priceCatalogItem({ ...base, cost: 100, sellingOverride: 140 })
    expect(r.unit_price).toBe(140); expect(r.supplier_cost).toBe(100); expect(r.price_note).toMatch(/price set on this option/)
  })
  it('treats a blank or zero rate as a hole, never as free', () => {
    for (const cost of [null, undefined, 0, '', 'abc']) {
      const r = priceCatalogItem({ ...base, cost })
      expect(r.unit_price).toBeNull(); expect(r.supplier_cost).toBeNull(); expect(r.price_note).toMatch(/no rate on file/)
    }
  })
  it('converts into the booking currency and says that it did', () => {
    const r = priceCatalogItem({ ...base, cost: 100, rateCurrency: 'USD', bookingCurrency: 'JPY', convert: usdToJpy })
    expect(r.unit_price).toBe(18750); expect(r.price_note).toMatch(/converted from USD/)
    expect(r.supplier_cost).toBe(100); expect(r.supplier_currency).toBe('USD')
  })
  it('rounds to the booking currency — a yen has no decimal place', () => {
    const r = priceCatalogItem({ ...base, cost: 100.37, rateCurrency: 'USD', bookingCurrency: 'JPY', convert: usdToJpy })
    expect(Number.isInteger(r.unit_price)).toBe(true)
  })
  it('refuses to invent a price when there is no rate to convert with', () => {
    const r = priceCatalogItem({ ...base, cost: 100, rateCurrency: 'USD', bookingCurrency: 'JPY', convert: noRates })
    expect(r.unit_price).toBeNull(); expect(r.price_note).toMatch(/no exchange rate for USD → JPY/); expect(r.supplier_cost).toBe(100)
  })
  it('does not convert an override it cannot convert either', () => {
    const r = priceCatalogItem({ ...base, cost: 100, sellingOverride: 140, rateCurrency: 'USD', bookingCurrency: 'JPY', convert: noRates })
    expect(r.unit_price).toBeNull(); expect(r.price_note).toMatch(/no exchange rate/)
  })
  it('passes a zero margin straight through', () => {
    expect(priceCatalogItem({ ...base, cost: 100, marginPercent: 0 }).unit_price).toBe(100)
  })
})

describe('entranceFeeBasis', () => {
  it('pre-fills the non-EUR rate and names the basis', () => {
    expect(entranceFeeBasis({ non_eur_rate: 20, eur_rate: 15 })).toEqual({ cost: 20, basis: 'non-EUR passport rate' })
  })
  it('falls back to the EUR rate, and says that is what it used', () => {
    expect(entranceFeeBasis({ non_eur_rate: 0, eur_rate: 15 })).toEqual({ cost: 15, basis: 'EUR passport rate' })
  })
  it('reports no basis at all when neither rate is usable', () => {
    expect(entranceFeeBasis({ non_eur_rate: null, eur_rate: 0 })).toEqual({ cost: null, basis: null })
  })
})
