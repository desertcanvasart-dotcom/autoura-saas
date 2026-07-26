import { describe, it, expect } from 'vitest'
import { buildFxIndex, type FxSnapshotRow } from '@/lib/fx-conversion'
import {
  computeTripPnL,
  buildPnlSummary,
  type PnlCommission,
  type PnlExpense,
  type PnlInvoice,
  type PnlItinerary,
} from '@/lib/trip-pnl'

// The two defects this module was written to close:
//   1. commissions never reached the margin
//   2. foreign-currency costs were summed at face value
// Both overstate profit, which is the dangerous direction — an operator
// confirms a booking believing it earns more than it does.

function snapshot(base: string, target: string, rate: number, capturedAt: string): FxSnapshotRow {
  return { base_currency: base, target_currency: target, rate, captured_at: capturedAt, source: 'er-api' }
}

/** EGP strengthening against EUR: 60 -> 50 per euro over Q1. */
const RATES = buildFxIndex([
  snapshot('EUR', 'EGP', 60, '2026-01-01T00:00:00.000Z'),
  snapshot('EUR', 'EGP', 55, '2026-02-15T00:00:00.000Z'),
  snapshot('EUR', 'EGP', 50, '2026-04-01T00:00:00.000Z'),
])

const EMPTY_RATES = buildFxIndex([])

function trip(overrides: Partial<PnlItinerary> = {}): PnlItinerary {
  return {
    id: 'trip-1',
    itinerary_code: 'EG-2026-001',
    trip_name: 'Cairo + Nile Cruise',
    client_name: 'Nakamura Group',
    start_date: '2026-03-01',
    end_date: '2026-03-08',
    status: 'completed',
    currency: 'EUR',
    total_cost: 4800,
    ...overrides,
  }
}

function expense(overrides: Partial<PnlExpense> = {}): PnlExpense {
  return {
    itinerary_id: 'trip-1',
    expense_number: 'EXP-001',
    amount: 100,
    currency: 'EUR',
    category: 'other',
    status: 'paid',
    expense_date: '2026-03-01',
    payment_date: null,
    ...overrides,
  }
}

function commission(overrides: Partial<PnlCommission> = {}): PnlCommission {
  return {
    itinerary_id: 'trip-1',
    description: 'Agent commission',
    commission_amount: 720,
    currency: 'EUR',
    commission_type: 'payable',
    category: 'agent_referral',
    status: 'pending',
    transaction_date: '2026-03-01',
    paid_date: null,
    due_date: null,
    ...overrides,
  }
}

function invoice(overrides: Partial<PnlInvoice> = {}): PnlInvoice {
  return {
    itinerary_id: 'trip-1',
    invoice_number: 'INV-001',
    total_amount: 4800,
    amount_paid: 4800,
    currency: 'EUR',
    status: 'paid',
    issue_date: '2026-02-01',
    paid_at: '2026-02-20T00:00:00.000Z',
    ...overrides,
  }
}

function compute(input: {
  itinerary?: PnlItinerary
  invoices?: PnlInvoice[]
  expenses?: PnlExpense[]
  commissions?: PnlCommission[]
  fxIndex?: ReturnType<typeof buildFxIndex>
  liveRate?: (from: string, to: string) => number | null
}) {
  return computeTripPnL({
    itinerary: input.itinerary || trip(),
    invoices: input.invoices || [],
    expenses: input.expenses || [],
    commissions: input.commissions || [],
    fxIndex: input.fxIndex || RATES,
    liveRate: input.liveRate,
  })
}

describe('commissions belong in the margin', () => {
  it('a payable commission reduces gross profit', () => {
    const withoutCommission = compute({
      invoices: [invoice()],
      expenses: [expense({ amount: 2000 })],
    })
    const withCommission = compute({
      invoices: [invoice()],
      expenses: [expense({ amount: 2000 })],
      commissions: [commission({ commission_amount: 720, commission_type: 'payable' })],
    })

    expect(withoutCommission.gross_profit).toBe(2800)
    expect(withCommission.gross_profit).toBe(2080)
    expect(withCommission.commissions_payable).toBe(720)
    expect(withCommission.net_commission).toBe(-720)
  })

  it('a receivable commission increases gross profit', () => {
    const result = compute({
      invoices: [invoice()],
      expenses: [expense({ amount: 2000 })],
      commissions: [commission({ commission_amount: 300, commission_type: 'receivable', category: 'shopping' })],
    })

    expect(result.commissions_receivable).toBe(300)
    expect(result.commissions_payable).toBe(0)
    expect(result.net_commission).toBe(300)
    expect(result.gross_profit).toBe(3100)
  })

  it('nets receivable against payable on the same trip', () => {
    const result = compute({
      invoices: [invoice()],
      expenses: [expense({ amount: 2000 })],
      commissions: [
        commission({ commission_amount: 720, commission_type: 'payable' }),
        commission({ commission_amount: 200, commission_type: 'receivable', category: 'hotel' }),
      ],
    })

    expect(result.net_commission).toBe(-520)
    expect(result.gross_profit).toBe(2280)
    expect(result.commission_count).toBe(2)
  })

  it('treats an unlabelled commission_type as receivable, matching the module default', () => {
    const result = compute({
      invoices: [invoice()],
      commissions: [commission({ commission_type: null, commission_amount: 100 })],
    })
    expect(result.commissions_receivable).toBe(100)
  })

  it('excludes cancelled commissions', () => {
    const result = compute({
      invoices: [invoice()],
      commissions: [commission({ status: 'cancelled', commission_amount: 720 })],
    })
    expect(result.commissions_payable).toBe(0)
    expect(result.commission_count).toBe(0)
    expect(result.gross_profit).toBe(4800)
  })

  it('counts a disputed commission — unresolved is not the same as void', () => {
    const result = compute({
      invoices: [invoice()],
      commissions: [commission({ status: 'disputed', commission_amount: 720 })],
    })
    expect(result.commissions_payable).toBe(720)
  })

  it('breaks commissions down by category for the drill-down', () => {
    const result = compute({
      commissions: [
        commission({ category: 'hotel', commission_type: 'receivable', commission_amount: 120 }),
        commission({ category: 'hotel', commission_type: 'receivable', commission_amount: 80 }),
        commission({ category: 'agent_referral', commission_type: 'payable', commission_amount: 720 }),
      ],
    })
    expect(result.commission_breakdown.hotel).toEqual({ receivable: 200, payable: 0 })
    expect(result.commission_breakdown.agent_referral).toEqual({ receivable: 0, payable: 720 })
  })
})

describe('costs convert at the rate on the day the money moved', () => {
  it('uses the payment-date rate, not the date the cost was incurred', () => {
    // 60,000 EGP hotel bill: incurred in January at 60 (= €1,000),
    // paid in April at 50 (= €1,200). The €200 difference is real money.
    const result = compute({
      invoices: [invoice()],
      expenses: [
        expense({
          amount: 60000,
          currency: 'EGP',
          category: 'accommodation',
          expense_date: '2026-01-10',
          payment_date: '2026-04-10',
        }),
      ],
    })

    expect(result.total_expenses).toBe(1200)
    expect(result.fx.historical).toBeGreaterThan(0)
    expect(result.complete).toBe(true)
  })

  it('falls back to the incurred date when nothing has been paid yet', () => {
    const result = compute({
      expenses: [
        expense({
          amount: 60000,
          currency: 'EGP',
          status: 'pending',
          expense_date: '2026-01-10',
          payment_date: null,
        }),
      ],
    })
    expect(result.total_expenses).toBe(1000)
    expect(result.expenses_pending).toBe(1000)
    expect(result.expenses_paid).toBe(0)
  })

  it('never sums a foreign amount at face value — the 56x bug', () => {
    const result = compute({
      invoices: [invoice()],
      expenses: [expense({ amount: 60000, currency: 'EGP', payment_date: '2026-04-10' })],
    })
    // The old code produced 4800 - 60000 = -55,200.
    expect(result.total_expenses).not.toBe(60000)
    expect(result.gross_profit).toBe(3600)
  })

  it('converts commissions on their own date too', () => {
    const result = compute({
      commissions: [
        commission({
          commission_amount: 55000,
          currency: 'EGP',
          commission_type: 'payable',
          transaction_date: '2026-01-05',
          paid_date: '2026-02-20',
        }),
      ],
    })
    // Paid 20 Feb -> 15 Feb rate of 55 -> €1,000
    expect(result.commissions_payable).toBe(1000)
  })

  it('converts revenue raised in another currency', () => {
    const result = compute({
      invoices: [
        invoice({
          total_amount: 264000,
          amount_paid: 264000,
          currency: 'EGP',
          paid_at: '2026-04-05T00:00:00.000Z',
        }),
      ],
    })
    expect(result.total_revenue).toBe(5280)
    expect(result.total_paid).toBe(5280)
  })
})

describe('an unconvertible cost is a hole, not a silent omission', () => {
  it('excludes it, records it, and marks the trip incomplete', () => {
    const result = compute({
      invoices: [invoice()],
      expenses: [
        expense({ amount: 500, currency: 'EUR' }),
        expense({ expense_number: 'EXP-JPY', amount: 90000, currency: 'JPY', payment_date: '2026-03-10' }),
      ],
      fxIndex: RATES,
    })

    expect(result.total_expenses).toBe(500)
    expect(result.complete).toBe(false)
    expect(result.holes).toHaveLength(1)
    expect(result.holes[0].fromCurrency).toBe('JPY')
    expect(result.holes[0].amount).toBe(90000)
    expect(result.fx.unconverted).toBe(1)
  })

  it('says explicitly that the margin is overstated', () => {
    const result = compute({
      expenses: [expense({ amount: 90000, currency: 'JPY' })],
    })
    expect(result.holes[0].message).toContain('overstated')
  })

  it('flags a commission hole as a commission', () => {
    const result = compute({
      commissions: [commission({ commission_amount: 50000, currency: 'JPY' })],
    })
    expect(result.holes[0].kind).toBe('commission')
    expect(result.complete).toBe(false)
  })

  it('labels a live-rate fallback rather than passing it off as historical', () => {
    const result = compute({
      expenses: [expense({ amount: 1000, currency: 'EGP', payment_date: '2020-01-01' })],
      liveRate: () => 1 / 50,
    })
    expect(result.total_expenses).toBe(20)
    expect(result.fx.live).toBe(1)
    expect(result.fx.all_historical).toBe(false)
    expect(result.complete).toBe(true)
  })

  it('reports all-historical when every line had a dated rate', () => {
    const result = compute({
      invoices: [invoice()],
      expenses: [expense({ amount: 55000, currency: 'EGP', payment_date: '2026-02-20' })],
    })
    expect(result.fx.all_historical).toBe(true)
    expect(result.fx.live).toBe(0)
  })
})

describe('status handling', () => {
  it('excludes a rejected expense — it is not a cost', () => {
    const result = compute({
      invoices: [invoice()],
      expenses: [expense({ amount: 500, status: 'rejected' }), expense({ amount: 200, status: 'paid' })],
    })
    expect(result.total_expenses).toBe(200)
    expect(result.expense_count).toBe(1)
  })

  it('splits paid from outstanding expenses', () => {
    const result = compute({
      expenses: [
        expense({ amount: 300, status: 'paid' }),
        expense({ amount: 200, status: 'approved' }),
        expense({ amount: 100, status: 'pending' }),
      ],
    })
    expect(result.expenses_paid).toBe(300)
    expect(result.expenses_pending).toBe(300)
    expect(result.total_expenses).toBe(600)
  })

  it('excludes a cancelled invoice from revenue', () => {
    const result = compute({
      invoices: [invoice({ total_amount: 4800, status: 'cancelled' })],
      expenses: [expense({ amount: 1000 })],
    })
    // Falls back to the quoted amount, since nothing is invoiced.
    expect(result.total_revenue).toBe(0)
    expect(result.gross_profit).toBe(3800)
  })

  it('falls back to the quoted amount when no invoice exists yet', () => {
    const result = compute({ expenses: [expense({ amount: 1000 })] })
    expect(result.quoted_amount).toBe(4800)
    expect(result.gross_profit).toBe(3800)
    expect(result.profit_margin).toBeCloseTo(79.17, 2)
  })

  it('reports a zero margin rather than dividing by zero', () => {
    const result = compute({
      itinerary: trip({ total_cost: 0 }),
      expenses: [expense({ amount: 100 })],
    })
    expect(result.profit_margin).toBe(0)
    expect(result.gross_profit).toBe(-100)
  })
})

describe('golden case — the real margin on a Cairo + Nile Cruise', () => {
  // The number an operator sees in a spreadsheet vs the number they earned.
  const result = compute({
    invoices: [invoice({ total_amount: 4800, amount_paid: 4800 })],
    expenses: [
      // Budgeted at €1,000 (Jan rate 60), actually paid in April at 50.
      expense({
        expense_number: 'EXP-HOTEL',
        amount: 60000,
        currency: 'EGP',
        category: 'accommodation',
        expense_date: '2026-01-10',
        payment_date: '2026-04-10',
        status: 'paid',
      }),
      expense({ expense_number: 'EXP-CRUISE', amount: 800, category: 'cruise', status: 'paid' }),
      // The costs that never make it into the spreadsheet:
      expense({ expense_number: 'EXP-GUIDE', amount: 120, category: 'guide', status: 'paid' }),
      expense({ expense_number: 'EXP-XFER', amount: 40, category: 'transportation', status: 'paid' }),
    ],
    commissions: [commission({ commission_amount: 720, commission_type: 'payable' })],
  })

  it('counts the FX movement between quote day and payment day', () => {
    expect(result.expense_breakdown.accommodation).toBe(1200)
  })

  it('lands on the real margin, not the spreadsheet one', () => {
    // Spreadsheet: 4800 - (1000 hotel + 800 cruise) = 3000
    // Real:        4800 - 2160 expenses - 720 commission = 1920
    expect(result.total_expenses).toBe(2160)
    expect(result.gross_profit).toBe(1920)
    expect(result.profit_margin).toBeCloseTo(40, 6)
  })

  it('is complete and fully historical, so the number is defensible', () => {
    expect(result.complete).toBe(true)
    expect(result.fx.all_historical).toBe(true)
    expect(result.holes).toEqual([])
  })
})

describe('buildPnlSummary — one currency, or none', () => {
  const eurTrip = compute({
    itinerary: trip({ id: 'a', currency: 'EUR', total_cost: 1000 }),
    expenses: [expense({ itinerary_id: 'a', amount: 400 })],
  })
  const egpTrip = compute({
    itinerary: trip({ id: 'b', currency: 'EGP', total_cost: 50000, start_date: '2026-04-05' }),
    expenses: [expense({ itinerary_id: 'b', amount: 20000, currency: 'EGP' })],
  })

  it('restates every trip into the reporting currency before adding', () => {
    const summary = buildPnlSummary({
      trips: [eurTrip, egpTrip],
      reportingCurrency: 'EUR',
      fxIndex: RATES,
    })

    // EUR trip: 1000 revenue / 600 profit.
    // EGP trip at the 1 Apr rate of 50: 50,000 -> €1,000, profit 30,000 -> €600.
    expect(summary.total_revenue).toBe(2000)
    expect(summary.total_profit).toBe(1200)
    expect(summary.reporting_currency).toBe('EUR')
  })

  it('does not add unlike currencies at face value', () => {
    const summary = buildPnlSummary({
      trips: [eurTrip, egpTrip],
      reportingCurrency: 'EUR',
      fxIndex: RATES,
    })
    // The old behaviour: 1000 + 50000 = 51,000 labelled as euros.
    expect(summary.total_revenue).not.toBe(51000)
  })

  it('drops a trip it cannot restate, and counts it', () => {
    const jpyTrip = compute({
      itinerary: trip({ id: 'c', currency: 'JPY', total_cost: 900000 }),
    })
    const summary = buildPnlSummary({
      trips: [eurTrip, jpyTrip],
      reportingCurrency: 'EUR',
      fxIndex: RATES,
    })

    expect(summary.untranslated_trips).toBe(1)
    expect(summary.total_revenue).toBe(1000)
    expect(summary.total_trips).toBe(2)
  })

  it('carries trip-level incompleteness up to the portfolio', () => {
    const holed = compute({
      itinerary: trip({ id: 'd' }),
      expenses: [expense({ itinerary_id: 'd', amount: 90000, currency: 'JPY' })],
    })
    const summary = buildPnlSummary({
      trips: [eurTrip, holed],
      reportingCurrency: 'EUR',
      fxIndex: RATES,
    })

    expect(summary.incomplete_trips).toBe(1)
    expect(summary.fx.unconverted).toBe(1)
    expect(summary.fx.all_historical).toBe(false)
  })

  it('averages margin directly — a ratio needs no conversion', () => {
    const summary = buildPnlSummary({
      trips: [eurTrip, egpTrip],
      reportingCurrency: 'EUR',
      fxIndex: RATES,
    })
    expect(summary.average_margin).toBeCloseTo(60, 6)
  })

  it('counts profitable and loss-making trips', () => {
    const lossTrip = compute({
      itinerary: trip({ id: 'e', currency: 'EUR', total_cost: 100 }),
      expenses: [expense({ itinerary_id: 'e', amount: 500 })],
    })
    const summary = buildPnlSummary({
      trips: [eurTrip, lossTrip],
      reportingCurrency: 'EUR',
      fxIndex: RATES,
    })
    expect(summary.profitable_trips).toBe(1)
    expect(summary.loss_trips).toBe(1)
  })

  it('needs no rates at all when everything is already in one currency', () => {
    const summary = buildPnlSummary({
      trips: [eurTrip],
      reportingCurrency: 'EUR',
      fxIndex: EMPTY_RATES,
    })
    expect(summary.total_revenue).toBe(1000)
    expect(summary.untranslated_trips).toBe(0)
  })
})
