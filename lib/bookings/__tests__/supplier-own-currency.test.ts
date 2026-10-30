import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { ownCost, ownCostIsCurrent, supplierOwnMoney } from '@/lib/supplier-own-currency'
import {
  supplierLinesFromServices, supplierCostCurrency, type ServiceForSupplier,
} from '@/lib/bookings/booking-suppliers'

// A booking's supplier rows — and the expense made when one is confirmed —
// are in the currency the supplier is paid in (EGP for a guide, USD for a
// cruise), not the trip's. Here supplier_cost_original is PER UNIT
// (lib/itinerary-fx): total_cost = original × exchange_rate_used × quantity.

const day = (n: number): Pick<ServiceForSupplier, 'day_number' | 'day_date'> => ({ day_number: n, day_date: null })
const src = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8')

describe('a line in its own currency (per-unit original)', () => {
  it('is original × quantity while that still agrees with total_cost', () => {
    // 4 entrance tickets at EGP 450 on a EUR trip, 1 EGP = 0.02 EUR
    const line = { quantity: 4, total_cost: 36, supplier_currency: 'EGP', supplier_cost_original: 450, exchange_rate_used: 0.02 }
    expect(ownCostIsCurrent(line)).toBe(true)
    expect(ownCost(line)).toBe(1800)
    // no quantity counts as one
    expect(ownCost({ total_cost: 9, supplier_currency: 'EGP', supplier_cost_original: 450, exchange_rate_used: 0.02 })).toBe(450)
  })

  it('once edited, is total_cost at the line’s own rate — never the stale original', () => {
    const edited = { quantity: 4, total_cost: 40, supplier_currency: 'EGP', supplier_cost_original: 450, exchange_rate_used: 0.02 }
    expect(ownCostIsCurrent(edited)).toBe(false)
    expect(ownCost(edited)).toBe(2000)
    // an original holding the line TOTAL (older data) fails the per-unit check
    // and is restated from the total, which is still right
    expect(ownCost({ quantity: 4, total_cost: 36, supplier_cost_original: 1800, exchange_rate_used: 0.02 })).toBe(1800)
  })

  it('without a rate there is no own cost', () => {
    expect(ownCost({ quantity: 1, total_cost: 36, supplier_cost_original: 450, exchange_rate_used: null })).toBeNull()
    expect(ownCost({ quantity: 1, total_cost: 36, supplier_cost_original: 450, exchange_rate_used: 0 })).toBeNull()
  })

  it('a group is in its own currency only when every line is in one foreign currency with a rate', () => {
    const egp = { quantity: 1, total_cost: 60, supplier_currency: 'EGP', supplier_cost_original: 3000, exchange_rate_used: 0.02 }
    expect(supplierOwnMoney([egp, { ...egp, supplier_currency: 'egp' }], 'EUR')).toMatchObject({ currency: 'EGP', total: 6000, own: true })
    expect(supplierOwnMoney([egp, { ...egp, supplier_currency: 'USD' }], 'EUR')).toMatchObject({ currency: 'EUR', total: 120, own: false })
    expect(supplierOwnMoney([egp, { ...egp, exchange_rate_used: null }], 'EUR')).toMatchObject({ currency: 'EUR', own: false })
    // the trip's own currency is not "foreign"
    expect(supplierOwnMoney([{ ...egp, supplier_currency: 'EUR' }], 'eur')).toMatchObject({ currency: 'eur', total: 60, own: false })
  })

  it('the lines the grid writes today (no original, no rate, the EUR column default) stay in the trip currency', () => {
    expect(supplierOwnMoney([{ quantity: 2, total_cost: 80, supplier_currency: 'EUR' }], 'USD')).toMatchObject({ currency: 'USD', total: 80, own: false })
  })
})

describe("a booking's service lines (one per itinerary service, 446)", () => {
  it("cost each line in its supplier's own currency, else the trip's (null = the booking's)", () => {
    const lines = supplierLinesFromServices([
      // a guide paid EGP on a yen trip
      { id: 's1', supplier_id: 'g1', supplier_name: 'Ahmed', service_type: 'guide', quantity: 1, total_cost: 9000, supplier_currency: 'EGP', supplier_cost_original: 3000, exchange_rate_used: 3, ...day(1) },
      // a cruise contracted per person in USD
      { id: 's2', supplier_id: 'c1', supplier_name: 'MS Nile', service_type: 'cruise', quantity: 2, total_cost: 300000, supplier_currency: 'USD', supplier_cost_original: 1000, exchange_rate_used: 150, ...day(2) },
      // priced in the trip's own currency, or with no rate → the trip's, at total_cost
      { id: 's3', supplier_id: 'h1', supplier_name: 'Hotel', service_type: 'hotel', quantity: 1, total_cost: 20000, supplier_currency: 'JPY', ...day(3) },
      { id: 's4', supplier_id: 't1', supplier_name: 'Car', service_type: 'transport', total_cost: 100, supplier_currency: 'EGP', ...day(3) },
    ], '2026-11-01', 2, 'JPY')
    expect(lines.map(l => [l.itinerary_service_id, l.quoted_cost, l.cost_currency])).toEqual([
      ['s1', 3000, 'EGP'],
      ['s2', 2000, 'USD'],
      ['s3', 20000, null],
      ['s4', 100, null],
    ])
  })

  it('without the trip currency nothing is "foreign": the booking’s, at total_cost', () => {
    const [row] = supplierLinesFromServices([
      { supplier_id: 'g1', supplier_name: 'Ahmed', service_type: 'guide', total_cost: 9000, supplier_currency: 'EGP', supplier_cost_original: 3000, exchange_rate_used: 3, ...day(1) },
    ], '2026-11-01')
    expect(row).toMatchObject({ quoted_cost: 9000, cost_currency: null })
  })

  it("supplierCostCurrency: the line's own, else the booking's", () => {
    expect(supplierCostCurrency({ cost_currency: 'egp' }, 'JPY')).toBe('EGP')
    expect(supplierCostCurrency({ cost_currency: null }, 'jpy')).toBe('JPY')
    expect(supplierCostCurrency({}, null)).toBe('EUR')
  })

  it('syncing reads the trip currency and the services’ own-currency columns', () => {
    const lib = src('lib/bookings/booking-suppliers.ts')
    const sync = lib.slice(lib.indexOf('export async function syncBookingSuppliers'))
    expect(sync).toContain("quantity, supplier_currency, supplier_cost_original, exchange_rate_used")
    expect(sync).toContain("from('itineraries').select('currency')")
    expect(sync).toContain('pax, tripCurrency)')
  })
})

describe('the Suppliers tab and its API', () => {
  it('labels each cost with the row currency', () => {
    const panel = src('components/booking/BookingSuppliersPanel.tsx')
    expect(panel).toContain('<span className="text-xs text-gray-400">{supplierCostCurrency(r, currency)}</span>')
    expect(panel).toContain('`${supplierCostCurrency(r, currency)} ${Number(r.confirmed_cost ?? r.quoted_cost).toFixed(2)}`')
  })

  it('a row added by hand may name its currency; saving a status or cost never rewrites it', () => {
    const route = src('app/api/bookings/[id]/suppliers/route.ts')
    expect(route).toContain('cost_currency: costCurrency === bookingCurrency ? null : costCurrency')
    const updateBranch = route.slice(route.indexOf('if (body.id) {'), route.indexOf('// Create new supplier entry'))
    expect(updateBranch).not.toMatch(/cost_currency/)
  })

  it('a confirmed extra goes onto the manifest in its supplier currency', () => {
    const route = src('app/api/bookings/[id]/extras/[eid]/route.ts')
    expect(route).toContain('cost_currency: costCurrency,')
  })
})
