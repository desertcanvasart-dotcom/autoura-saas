import { describe, it, expect } from 'vitest'
import { actualMargin, quotedMargin } from '@/lib/itineraries/margin'
import { tripAttention } from '@/lib/itineraries/trip-stage'

describe('the quoted margin, on cost', () => {
  it('each line at its client price, or its cost plus the itinerary margin', () => {
    expect(quotedMargin([{ total_cost: 100 }, { total_cost: 100, client_price: 105 }], 25))
      .toEqual({ supplierCost: 200, clientPrice: 230, margin: 30, percent: 15 })
  })
  it('nothing priced: 0, not a division by zero', () => {
    expect(quotedMargin([], 25).percent).toBe(0)
  })
})

describe('the actual margin, on the costs recorded so far', () => {
  const pnl = { total_revenue: 1200, gross_profit: 200, invoice_count: 1, expense_count: 3 }
  it('profit over costs', () => {
    expect(actualMargin(pnl)).toEqual({ profit: 200, costs: 1000, percent: 20 })
  })
  it('nothing until there is an invoice and a cost', () => {
    expect(actualMargin({ ...pnl, invoice_count: 0 })).toBeNull()
    expect(actualMargin({ ...pnl, expense_count: 0 })).toBeNull()
    expect(actualMargin(null)).toBeNull()
  })
})

describe('margin in "needs attention"', () => {
  const base = {
    status: 'confirmed', hasBooking: true, hasInvoice: true, invoiced: 100, paid: 100,
    startDate: '2026-12-10', endDate: '2026-12-14', today: '2026-10-01', currency: 'EUR', staleNights: [], cruiseNotes: [],
  }
  const margins = (a: ReturnType<typeof tripAttention>) => a.filter(x => x.action?.kind === 'open_finance').map(x => x.message)

  it('a quoted margin below the minimum', () => {
    expect(margins(tripAttention({ ...base, minMarginPercent: 15, quotedMarginPercent: 8 })))
      .toEqual(['The quoted margin is 8% on cost — below your 15% minimum.'])
  })

  it('at or above the minimum, or no minimum set: nothing', () => {
    expect(margins(tripAttention({ ...base, minMarginPercent: 15, quotedMarginPercent: 15 }))).toEqual([])
    expect(margins(tripAttention({ ...base, minMarginPercent: null, quotedMarginPercent: 2 }))).toEqual([])
  })

  it('once there is an actual, it decides: below the minimum, or a loss whatever the setting', () => {
    expect(margins(tripAttention({ ...base, minMarginPercent: 15, quotedMarginPercent: 25, actualMargin: { profit: 50, percent: 9.54 } })))
      .toEqual(['Profit so far is 9.5% on cost — below your 15% minimum.'])
    expect(margins(tripAttention({ ...base, minMarginPercent: 15, quotedMarginPercent: 8, actualMargin: { profit: 300, percent: 30 } }))).toEqual([])
    expect(margins(tripAttention({ ...base, minMarginPercent: null, actualMargin: { profit: -120, percent: -10 } })))
      .toEqual(['This trip is losing money so far: EUR -120.00 after the costs recorded.'])
  })

  it('a cancelled trip says nothing', () => {
    expect(tripAttention({ ...base, status: 'cancelled', minMarginPercent: 15, quotedMarginPercent: 2 })).toEqual([])
  })
})
