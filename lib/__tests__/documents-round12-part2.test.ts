import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { matchState, otherCurrency, isMatchable } from '@/lib/supplier-invoices/match-state'
import { invoiceBalance, sumPayments } from '@/lib/invoices/invoice-balance'
import { tripCostBreakdown } from '@/lib/invoices/trip-cost-breakdown'
import { roundLinesToTotal, formatTotals } from '@/lib/currency-totals'
import { computeAddTravellerReprice } from '@/lib/reprice-add-traveller'
import { manifestCost } from '@/lib/bookings/extra-supplier-cost'
import { totalWithBookingExtras } from '@/lib/itinerary-client-total'
import type { ExchangeRate } from '@/lib/currency'

// ============================================
// Documents audit, round 12 — part 2: money and the documents customers see
// ============================================

const src = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')

describe('supplier bills', () => {
  it('a reviewed bill cannot be re-matched or unmatched', () => {
    expect(isMatchable('received')).toBe(true)
    expect(isMatchable('matched')).toBe(true)
    for (const s of ['approved', 'paid', 'disputed', 'cancelled', null]) expect(isMatchable(s)).toBe(false)
  })

  it('a partly matched bill stays received, not matched', () => {
    expect(matchState(1000, [600])).toMatchObject({ match_status: 'partial', status: 'received', matched_amount: 600, discrepancy_amount: 400 })
    expect(matchState(1000, [600, 400])).toMatchObject({ match_status: 'matched', status: 'matched' })
    expect(matchState(1000, [])).toMatchObject({ match_status: 'unmatched', status: 'received' })
    expect(matchState(1000, [1200])).toMatchObject({ match_status: 'discrepancy', status: 'received' })
  })

  it('an expense in another currency does not match', () => {
    expect(otherCurrency('USD', [{ id: 'a', currency: 'EUR' }, { id: 'b', currency: 'usd' }])).toEqual(['a'])
    expect(otherCurrency(null, [{ id: 'a', currency: null }])).toEqual([])
  })

  it('both match routes check the status; the edit route guards the currency', () => {
    const match = src('app/api/supplier-invoices/[id]/match/route.ts')
    expect(match.match(/!isMatchable\(invoice\.status\)/g)?.length).toBe(2)
    expect(match).toContain(".in('status', MATCHABLE)")
    const edit = src('app/api/supplier-invoices/[id]/route.ts')
    expect(edit).toContain('Unmatch its expenses before changing the invoice currency')
    const fields = edit.slice(edit.indexOf('const allowedFields = ['), edit.indexOf(']', edit.indexOf('const allowedFields = [')))
    expect(fields).toContain("'supplier_invoice_number'")
    expect(fields).not.toMatch(/'total_amount'|'subtotal'|'invoice_number'/)
  })
})

describe('an invoice balance', () => {
  it('payments summed in the currency decimals leave nothing due', () => {
    const paid = sumPayments([{ amount: 28.4 }, { amount: 35.8 }, { amount: 35.8 }], 'EUR')
    expect(invoiceBalance({ total: 100, paid, currency: 'EUR', status: 'partially_paid' }, () => 'now'))
      .toEqual({ amount_paid: 100, balance_due: 0, status: 'paid', paid_at: 'now' })
  })

  it('deleting a payment never moves a draft or cancelled invoice', () => {
    expect(invoiceBalance({ total: 100, paid: 0, currency: 'EUR', status: 'draft' }).status).toBe('draft')
    expect(invoiceBalance({ total: 100, paid: 50, currency: 'EUR', status: 'cancelled' }).status).toBe('cancelled')
    expect(invoiceBalance({ total: 100, paid: 0, currency: 'EUR', status: 'overdue' }).status).toBe('overdue')
    expect(invoiceBalance({ total: 100, paid: 0, currency: 'EUR', status: 'paid' }).status).toBe('sent')
    expect(invoiceBalance({ total: 100, paid: 0, currency: 'EUR', status: 'partially_paid' }).status).toBe('sent')
  })

  it('a new total moves paid / part-paid, and keeps the first paid date', () => {
    expect(invoiceBalance({ total: 200, paid: 100, currency: 'EUR', status: 'paid', paidAt: 'then' }))
      .toEqual({ amount_paid: 100, balance_due: 100, status: 'partially_paid', paid_at: null })
    expect(invoiceBalance({ total: 100, paid: 100, currency: 'EUR', status: 'paid', paidAt: 'then' }).paid_at).toBe('then')
  })

  it('the routes use it; the edit refuses an empty total and a currency change after payments', () => {
    expect(src('app/api/invoices/[id]/payments/[paymentId]/route.ts')).toContain('invoiceBalance(')
    const edit = src('app/api/invoices/[id]/route.ts')
    expect(edit).toContain('invoiceBalance(')
    expect(edit).toContain('The total must be a positive amount')
    expect(edit).toContain('delete them before changing it')
  })
})

describe('yen in documents', () => {
  it('rounded lines still add up to their total', () => {
    const rows = roundLinesToTotal([333.4, 333.3, 333.3], 'JPY')
    expect(rows.reduce((s, r) => s + r, 0)).toBe(1000)
    expect(rows.every(r => Number.isInteger(r))).toBe(true)
    const eur = roundLinesToTotal([10.005, 20.004, 30.001], 'EUR')
    expect(Math.round(eur.reduce((s, r) => s + r, 0) * 100) / 100).toBe(60.01)
  })

  it('the quote PDF prints the rows rounded together', () => {
    expect(src('lib/pdf-generator.ts')).toContain('roundLinesToTotal(services.map(s => s.total), currency)')
  })

  it('the trip breakdown is in whole yen and adds up', () => {
    const b = tripCostBreakdown({ invoiceType: 'deposit', totalAmount: 33333, depositPercent: 30, currency: 'JPY' })
    expect(b).toEqual({ fullTripCost: 111110, depositAmount: 33333, balanceAmount: 77777 })
    const eur = tripCostBreakdown({ invoiceType: 'deposit', totalAmount: 100, depositPercent: 30, currency: 'EUR' })
    expect(eur).toEqual({ fullTripCost: 333.33, depositAmount: 100, balanceAmount: 233.33 })
  })

  it('a final invoice leaves its extras out of the trip cost', () => {
    const b = tripCostBreakdown({
      invoiceType: 'final', totalAmount: 1100, depositPercent: 10, currency: 'EUR',
      lineItems: [{ amount: 900 }, { amount: 200, addition: true }],
    })
    expect(b.fullTripCost).toBe(1000)
    expect(b.depositAmount).toBe(100)
  })

  it('the office invoice page and the PDF share the breakdown; no two-decimal yen', () => {
    const page = src('app/invoices/[id]/page.tsx')
    expect(page).toContain('tripCostBreakdown(')
    expect(page).not.toContain('.toFixed(2)')
    expect(src('lib/invoice-pdf-generator.ts')).toContain('tripCostBreakdown(')
  })

  it('adding a traveller to a yen booking reprices in whole yen', () => {
    const r = computeAddTravellerReprice({ oldTotal: 100000, oldPax: 3, addedPax: 1, depositPercent: 30, oldBalanceDue: 70000, currency: 'JPY' })
    if (r.method !== 'per_person') throw new Error('expected per_person')
    expect(r.perPerson).toBe(33333)
    expect(r.newTotal).toBe(133333)
    expect(Number.isInteger(r.newDepositAmount)).toBe(true)
    const eur = computeAddTravellerReprice({ oldTotal: 100, oldPax: 3, addedPax: 1, depositPercent: 0, oldBalanceDue: 0 })
    if (eur.method !== 'per_person') throw new Error('expected per_person')
    expect(eur.perPerson).toBe(33.33)
  })

  it('a booking deposit is in the currency’s units', () => {
    expect(src('app/api/bookings/from-quote/route.ts')).toContain("roundToCurrency((total_amount * deposit_percent) / 100, quote.currency || 'EUR')")
  })

  it('currency tiles use the currency’s decimals', () => {
    expect(formatTotals({ JPY: 120000 })).toBe('JPY 120,000')
    expect(formatTotals({ EUR: 1200 })).toMatch(/1,200\.00$/)
  })
})

describe('a confirmed extra’s supplier cost', () => {
  const rates: ExchangeRate[] = [
    { base_currency: 'EUR', target_currency: 'EGP', rate: 50, is_active: true } as ExchangeRate,
    { base_currency: 'EUR', target_currency: 'JPY', rate: 160, is_active: true } as ExchangeRate,
  ]
  it('goes onto the manifest in the booking currency', () => {
    expect(manifestCost({ supplier_cost: 150, supplier_currency: 'EGP' }, 'JPY', rates)).toEqual({
      quotedCost: 480, note: ' (supplier cost EGP 150)',
    })
  })
  it('with no rate, is left for a person — not stated as ¥150', () => {
    const r = manifestCost({ supplier_cost: 150, supplier_currency: 'EGP' }, 'USD', [])
    expect(r.quotedCost).toBeNull()
    expect(r.note).toContain('no USD rate')
  })
  it('in the booking currency, stays as it is', () => {
    expect(manifestCost({ supplier_cost: 150, supplier_currency: 'jpy' }, 'JPY', [])).toEqual({ quotedCost: 150, note: '' })
    expect(manifestCost({ supplier_cost: null }, 'JPY', [])).toEqual({ quotedCost: null, note: '' })
  })
})

describe('commissions and guides', () => {
  it('commission totals are per currency', () => {
    const r = src('app/api/commissions/route.ts')
    expect(r).toContain('sumByCurrency(rows, c => c.commission_amount, c => c.currency)')
    expect(src('app/commissions/page.tsx')).toContain('formatTotals(summary.total_receivable)')
  })
  it('a cancelled trip generates no commissions', () => {
    expect(src('app/api/itineraries/[id]/generate-commissions/route.ts')).toContain("itinerary.status === 'cancelled'")
  })
  it('a commission’s client and trip must be the tenant’s', () => {
    expect(src('app/api/commissions/[id]/route.ts')).toContain('recordsInTenant(supabase, authResult.tenant_id')
  })
  it('guide revenue is per currency', () => {
    expect(src('app/api/guides/route.ts')).toContain('sumByCurrency(bookings, b => b.total_cost, b => b.currency)')
  })
})

describe('the totals a client sees', () => {
  it('the share page adds the confirmed extras of the live booking', () => {
    expect(totalWithBookingExtras(1000, 'EUR', [{ status: 'confirmed', currency: 'EUR', extras_total: 150 }])).toBe(1150)
    expect(totalWithBookingExtras(1000, 'EUR', [{ status: 'cancelled', currency: 'EUR', extras_total: 150 }])).toBe(1000)
    expect(totalWithBookingExtras(1000, 'EUR', [{ status: 'confirmed', currency: 'USD', extras_total: 150 }])).toBe(1000)
    expect(totalWithBookingExtras(0, 'EUR', [{ status: 'confirmed', currency: 'EUR', extras_total: 150 }])).toBe(0)
    expect(src('app/share/[token]/page.tsx')).toContain('totalWithBookingExtras(')
  })
  it('editing one cost keeps each line’s client price in the trip total', () => {
    const page = src('app/itineraries/[id]/page.tsx')
    expect(page).toContain('itineraryClientTotal(services, marginPercent)')
    expect(page).not.toContain('supplierSum * (1 + marginPercent / 100)')
  })
})
