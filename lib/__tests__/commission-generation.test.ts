import { describe, it, expect } from 'vitest'
import {
  buildCommissions,
  commissionDirection,
  summariseSkips,
  unmappedServiceTypes,
  type CommissionSourceService,
} from '../commission-generation'

// C2: the direction-aware commission engine. The invariants that were once
// broken and must stay pinned: a receivable base is the SUPPLIER's price
// (never client price, never our markup); a payable base is PROFIT and no
// commission is paid on a loss; sellers are always payable; every skip is
// reported with a reason.

const CTX = {
  tenantId: 't1',
  itineraryId: 'i1',
  itineraryCode: 'ITN-2026-0001',
  clientId: 'c1',
  startDate: '2026-10-01',
  currency: 'usd',
  today: '2026-08-29',
}

function svc(overrides: Partial<CommissionSourceService>): CommissionSourceService {
  return {
    id: 's1',
    service_type: 'entrance',
    service_name: 'Petra entry',
    client_price: 100,
    total_cost: 60,
    supplier_id: 'sup1',
    supplier: { id: 'sup1', name: 'Petra Gate', commission_type: 'receivable', default_commission_rate: 10 },
    ...overrides,
  }
}

describe('directions', () => {
  it('receivable: base is the SUPPLIER price, currency uppercased, date = trip start', () => {
    const { pairs, skipped } = buildCommissions([svc({})], CTX)
    expect(skipped).toEqual([])
    expect(pairs).toHaveLength(1)
    const c = pairs[0].commission
    expect(c.commission_type).toBe('receivable')
    expect(c.base_amount).toBe(60)       // never the client price
    expect(c.cost_amount).toBe(60)
    expect(c.commission_amount).toBe(6)  // 10% of 60
    expect(c.currency).toBe('USD')
    expect(c.transaction_date).toBe('2026-10-01')
    expect(c.category).toBe('attraction')
  })

  it('payable: base is PROFIT, and a loss pays nothing', () => {
    const payable = { id: 'sup1', name: 'Guide', commission_type: 'payable', default_commission_rate: 20 }
    const { pairs } = buildCommissions([svc({ supplier: payable })], CTX)
    expect(pairs[0].commission.base_amount).toBe(40)      // 100 − 60
    expect(pairs[0].commission.commission_amount).toBe(8) // 20% of 40
    expect(pairs[0].commission.cost_amount).toBe(60)      // audit base kept

    const loss = buildCommissions([svc({ supplier: payable, client_price: 50 })], CTX)
    expect(loss.pairs).toEqual([])
    expect(loss.skipped[0].reason).toBe('no_profit')

    const unpriced = buildCommissions([svc({ supplier: payable, client_price: null })], CTX)
    expect(unpriced.skipped[0].reason).toBe('no_client_price')
  })

  it('no supplier cost → skipped, NEVER priced off the client price', () => {
    const { pairs, skipped } = buildCommissions([svc({ total_cost: 0 })], CTX)
    expect(pairs).toEqual([])
    expect(skipped[0].reason).toBe('no_base_amount')
  })

  it('unknown direction reads as receivable', () => {
    expect(commissionDirection({ commission_type: 'weird' })).toBe('receivable')
    expect(commissionDirection(null)).toBe('receivable')
  })
})

describe('the seller (sold by)', () => {
  const seller = { id: 'g1', name: 'Ahmed', commission_type: 'payable', default_commission_rate: 15 }

  it('yields a SECOND, payable commission on the same profit', () => {
    const { pairs } = buildCommissions(
      [svc({ sold_by_supplier_id: 'g1', seller })],
      CTX
    )
    expect(pairs).toHaveLength(2)
    const sale = pairs.find(p => p.commission.category === 'optional_tour')!
    expect(sale.commission.supplier_id).toBe('g1')
    expect(sale.commission.commission_type).toBe('payable')
    expect(sale.commission.base_amount).toBe(40)
    expect(sale.commission.commission_amount).toBe(6) // 15% of 40
  })

  it('a receivable-configured seller is refused with a reason, not silently paid', () => {
    const { pairs, skipped } = buildCommissions(
      [svc({ sold_by_supplier_id: 'g1', seller: { ...seller, commission_type: 'receivable' } })],
      CTX
    )
    expect(pairs).toHaveLength(1) // the provider's own commission still runs
    expect(skipped[0].reason).toBe('seller_not_payable')
  })
})

describe('bookkeeping', () => {
  it('already-generated services are skipped, not double-counted', () => {
    const { pairs, skipped } = buildCommissions([svc({ commission_status: 'generated' })], CTX)
    expect(pairs).toEqual([])
    expect(skipped[0].reason).toBe('already_generated')
  })

  it('rounds to cents', () => {
    const { pairs } = buildCommissions(
      [svc({ total_cost: 33.33, supplier: { id: 'sup1', name: 'X', commission_type: 'receivable', default_commission_rate: 7 } })],
      CTX
    )
    expect(pairs[0].commission.commission_amount).toBe(2.33)
  })

  it('summarises skips and every routable service type is mapped', () => {
    expect(summariseSkips([
      { service_id: 'a', service_name: 'a', reason: 'no_rate', detail: '' },
      { service_id: 'b', service_name: 'b', reason: 'no_rate', detail: '' },
    ])).toEqual({ no_rate: 2 })
    expect(unmappedServiceTypes()).toEqual([])
  })
})
