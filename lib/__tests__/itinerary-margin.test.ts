import { describe, it, expect } from 'vitest'
import {
  resolveItineraryMargin,
  itineraryClientTotal,
  effectiveItineraryTotal,
} from '@/lib/itinerary-client-total'
import { checkAmountDeliverable } from '@/lib/pricing-guards'

// ============================================================================
// The itinerary page hardcoded `const margin = 25` while the SAME FILE already
// read itinerary.margin_percent when persisting total_cost. The hardcoded path
// fed the header, the client email and invoice generation — so an itinerary
// configured at 40% was quoted and invoiced at 25%.
//
// The rules now live in lib/itinerary-client-total.ts, shared by the page and
// the email route. These pin the arithmetic, including the two traps: a
// nullable column, and 0 being a real margin rather than a missing one.
// ============================================================================

// The real functions — the page and the email route both use them.
const resolveMargin = resolveItineraryMargin
const clientTotal = itineraryClientTotal

describe('resolveMargin', () => {
  it('uses the itinerary’s configured margin', () => {
    expect(resolveMargin(40)).toBe(40)
    expect(resolveMargin('37.5')).toBe(37.5)
  })

  it('treats 0 as a REAL margin, not a missing one', () => {
    // The trap in `Number(x) || 25`: an at-cost trip would be resold at 25%.
    expect(resolveMargin(0)).toBe(0)
    expect(resolveMargin('0')).toBe(0)
  })

  it('falls back to 25 only when there is genuinely no value', () => {
    for (const missing of [null, undefined, '', 'abc', NaN]) {
      expect(resolveMargin(missing), String(missing)).toBe(25)
    }
  })
})

describe('the bug this fixed', () => {
  const services = [{ total_cost: 10000 }]

  it('a 40% itinerary is no longer quoted at 25%', () => {
    expect(clientTotal(services, 40)).toBe(14000)   // was 12500 — €1,500 lost
  })

  it('a 25% itinerary is unchanged, so nothing silently reprices', () => {
    expect(clientTotal(services, 25)).toBe(12500)
  })

  it('a low-margin itinerary is no longer OVER-quoted', () => {
    // The reverse of the same bug: 10% was being sold at 25%.
    expect(clientTotal(services, 10)).toBe(11000)
  })

  it('an at-cost trip is sold at cost', () => {
    expect(clientTotal(services, 0)).toBe(10000)
  })

  it('an unpriced margin still behaves as it always did', () => {
    expect(clientTotal(services, null)).toBe(12500)
  })
})

describe('per-service client_price still wins over the margin', () => {
  it('an explicitly priced service ignores the margin entirely', () => {
    expect(clientTotal([{ total_cost: 100, client_price: 500 }], 40)).toBe(500)
  })

  it('mixes explicit and margin-derived prices correctly', () => {
    // 500 explicit + (100 * 1.4) = 640
    expect(clientTotal([{ total_cost: 100, client_price: 500 }, { total_cost: 100 }], 40)).toBe(640)
  })

  it('rounds to cents', () => {
    expect(clientTotal([{ total_cost: 33.33 }], 37.5)).toBe(45.83)
  })
})

describe('effectiveItineraryTotal', () => {
  it('uses the services when they price above zero', () => {
    expect(effectiveItineraryTotal({ total_cost: 999, margin_percent: 40 }, [{ total_cost: 100 }])).toBe(140)
  })

  it('falls back to the stored total when there are no priced services', () => {
    expect(effectiveItineraryTotal({ total_cost: 999, margin_percent: 40 }, [])).toBe(999)
    expect(effectiveItineraryTotal({ total_cost: '999', margin_percent: 40 }, [{ total_cost: 0 }])).toBe(999)
  })

  it('is 0 when nothing is priced, which the send gate refuses', () => {
    expect(effectiveItineraryTotal({ total_cost: null, margin_percent: null }, [])).toBe(0)
    expect(checkAmountDeliverable(0).ok).toBe(false)
  })
})

describe('why the total must be a number, not toFixed()', () => {
  it('the deliverable gate refuses a numeric string — the "Send email" 422', () => {
    expect(checkAmountDeliverable('1900.00' as unknown as number).ok).toBe(false)
    expect(checkAmountDeliverable(1900).ok).toBe(true)
  })
})
