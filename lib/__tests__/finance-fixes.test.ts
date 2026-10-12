import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { computeTripPnL, buildPnlSummary, type PnlInvoice, type PnlItinerary } from '../trip-pnl'
import { checkExpenseFields } from '../expenses/expense-fields'
import { checkCommissionFields } from '../commissions/commission-fields'

// ============================================================================
// Finance group: what a trip earns, the checks on expenses and commissions,
// and who may reach the finance routes.
// ============================================================================

const src = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8')
const trip = (over: Partial<PnlItinerary> = {}): PnlItinerary => ({ id: 't1', status: 'confirmed', currency: 'EUR', total_cost: 10000, start_date: '2026-05-01', ...over })
const inv = (over: Partial<PnlInvoice> = {}): PnlInvoice => ({ itinerary_id: 't1', total_amount: 0, currency: 'EUR', status: 'sent', invoice_type: 'standard', ...over })
const pnl = (itinerary: PnlItinerary, invoices: PnlInvoice[] = [], expenses: Array<{ amount: number }> = []) =>
  computeTripPnL({
    itinerary, invoices,
    expenses: expenses.map((e, i) => ({ itinerary_id: 't1', expense_number: `E${i}`, amount: e.amount, currency: 'EUR', status: 'approved', category: 'hotel' })),
    commissions: [], fxIndex: new Map(),
  })

describe('what a trip earns', () => {
  it('a deposit invoice is not the trip\'s revenue — the quote is, until the rest is invoiced', () => {
    const p = pnl(trip(), [inv({ total_amount: 2000, invoice_type: 'deposit' })], [{ amount: 7000 }])
    expect(p.revenue_basis).toBe('quoted')
    expect(p.gross_profit).toBe(3000)
  })

  it('a final invoice is the revenue, net of tax', () => {
    const p = pnl(trip(), [inv({ total_amount: 11400, tax_amount: 1400, invoice_type: 'final' })], [{ amount: 7000 }])
    expect(p.revenue_basis).toBe('invoiced')
    expect(p.revenue_for_margin).toBe(10000)
    expect(p.gross_profit).toBe(3000)
  })

  it('a cancelled trip earns only what was invoiced', () => {
    const p = pnl(trip({ status: 'cancelled', total_cost: 20000 }), [], [{ amount: 500 }])
    expect(p.revenue_basis).toBe('none')
    expect(p.gross_profit).toBe(-500)
  })

  it('the portfolio margin is profit over revenue, not the average of trip margins', () => {
    const big = pnl(trip({ id: 'a', total_cost: 10000 }), [], [{ amount: 5000 }])
    const small = { ...pnl(trip({ id: 'b', total_cost: 100 }), [], [{ amount: 100 }]), itinerary_id: 'b' }
    const s = buildPnlSummary({ trips: [{ ...big, itinerary_id: 'a' }, small], reportingCurrency: 'EUR', fxIndex: new Map() })
    expect(s.average_margin).toBeCloseTo((5000 / 10100) * 100, 5)
    expect(s.trip_profit_reporting.a).toBe(5000)
  })
})

describe('expense and commission checks', () => {
  it('refuses a negative or non-numeric amount and a script receipt link', () => {
    expect(checkExpenseFields({ amount: -5 })).toMatch(/above 0/)
    expect(checkExpenseFields({ amount: 'abc' })).toMatch(/above 0/)
    expect(checkExpenseFields({ receipt_url: 'javascript:alert(1)' })).toMatch(/http/)
    const ok: Record<string, unknown> = { amount: '12.5', currency: 'egp' }
    expect(checkExpenseFields(ok)).toBeNull()
    expect(ok).toEqual({ amount: 12.5, currency: 'EGP' })
  })

  it('refuses an unknown commission type or status, and a rate over 100', () => {
    expect(checkCommissionFields({ commission_type: 'agent' })).toMatch(/receivable or payable/)
    expect(checkCommissionFields({ status: 'done' })).toMatch(/Status/)
    expect(checkCommissionFields({ commission_rate: 150 })).toMatch(/0 to 100/)
    expect(checkCommissionFields({ commission_type: 'payable', status: 'disputed', commission_amount: '40' })).toBeNull()
  })
})

describe('who reaches the finance routes', () => {
  it('managers only for the finance-only areas; staff for invoices, payments and expenses; deletes for managers', () => {
    for (const f of ['app/api/accounts-receivable/route.ts', 'app/api/accounts-payable/route.ts', 'app/api/supplier-invoices/[id]/pay/route.ts', 'app/api/ai/parse-supplier-invoice/route.ts', 'app/api/financial-reports/route.ts', 'app/api/itineraries/[id]/generate-commissions/route.ts']) {
      expect(src(f)).toMatch(/gateRole\('manage'\)/)
    }
    expect(src('app/api/profit-loss/route.ts')).toMatch(/roleDenied\(authResult\.role, 'manage'\)/)
    for (const f of ['app/api/invoices/route.ts', 'app/api/payments/route.ts', 'app/api/expenses/route.ts']) {
      expect(src(f)).toMatch(/gateRole\('staff'\)/)
    }
    for (const f of ['app/api/invoices/[id]/route.ts', 'app/api/payments/[id]/route.ts', 'app/api/expenses/[id]/route.ts']) {
      expect(src(f).split('export async function DELETE')[1]).toMatch(/gateRole\('manage'\)/)
    }
    const mw = src('middleware.ts')
    expect(mw).toMatch(/'\/commissions': \['admin', 'manager'\]/)
    expect(mw).toMatch(/'\/supplier-invoices': \['admin', 'manager'\]/)
  })

  it('commission generation claims the services before inserting', () => {
    const g = src('app/api/itineraries/[id]/generate-commissions/route.ts')
    expect(g.indexOf("update({ commission_status: 'generated' })")).toBeLessThan(g.indexOf(".from('commissions')\n      .insert"))
  })
})
