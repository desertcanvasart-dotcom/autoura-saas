import { describe, it, expect } from 'vitest'
import { buildTripAttention, type AttentionSource } from '@/lib/itineraries/attention'

// The itinerary page lists these; the itineraries list counts them. Both
// call buildTripAttention, so one set of inputs gives one answer.

const base: AttentionSource = {
  itinerary: { status: 'confirmed', start_date: '2026-10-10', end_date: '2026-10-13', currency: 'EUR', margin_percent: 25 },
  today: '2026-10-01',
  hasBooking: true,
  hasInvoice: true,
  pnl: { total_revenue: 2000, total_paid: 500, gross_profit: 400, invoice_count: 1, expense_count: 2 },
  days: [
    { id: 'd1', day_number: 1, date: '2026-10-10', services: [
      { service_type: 'accommodation', service_name: 'Mena House', description: '[pricing-grid:accommodation] Mena House', total_cost: 300, property_rate_status: 'not_on_file' },
    ] },
    { id: 'd2', day_number: 2, date: '2026-10-11', services: [{ service_type: 'guide', service_name: 'Egyptologist', total_cost: 80 }] },
  ],
  assignments: [],
  cruiseNotes: [],
  minMarginPercent: null,
}

describe('a trip\'s needs-attention list, built once', () => {
  it('gathers each rule\'s inputs: a removed rate, a missing guide, an unpaid balance close to the start', () => {
    const { attention, facts } = buildTripAttention(base)
    expect(facts).toMatchObject({ invoiced: 2000, paid: 500, hasBooking: true })
    expect(attention.map(a => a.message)).toEqual([
      'Day 1: Mena House is no longer in your rates — it was removed after this trip was priced.',
      'The trip starts in 9 days with EUR 1500.00 still unpaid.',
      'No guide assigned for day 2.',
    ])
  })

  it('assignments not loaded yet: nobody is called missing', () => {
    const { attention } = buildTripAttention({ ...base, assignments: null })
    expect(attention.some(a => a.action?.kind === 'assign_resources')).toBe(false)
  })

  it('no P&L yet: no money rules, and no invoice is not inferred from it', () => {
    const { facts } = buildTripAttention({ ...base, pnl: null })
    expect(facts).toMatchObject({ invoiced: null, paid: null, hasInvoice: true })
  })

  it('the minimum margin, against the quoted margin when there is no actual yet', () => {
    const { attention } = buildTripAttention({
      ...base, minMarginPercent: 30, pnl: { ...base.pnl!, expense_count: 0 },
    })
    expect(attention.map(a => a.message)).toContain('The quoted margin is 25% on cost — below your 30% minimum.')
  })
})
