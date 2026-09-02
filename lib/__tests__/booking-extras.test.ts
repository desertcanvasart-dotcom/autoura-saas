// Ported verbatim from travel-ops-pro (__tests__/lib/booking-extras.test.ts).
import { describe, it, expect } from 'vitest'
import {
  extrasTotal, applyExtras, nextStatus, isPriced, lineAmount, paymentStandingFor, totalPaidFrom,
  type BookingExtraLine, type ExtraStatus,
} from '@/lib/booking-extras'

const extra = (over: Partial<BookingExtraLine> = {}): BookingExtraLine => ({
  id: 'e1', title: 'Extra tour', quantity: 1, unit_price: 100, currency: 'EUR', status: 'confirmed', ...over,
})

describe('extrasTotal', () => {
  it('is zero when there are no extras', () => {
    const r = extrasTotal([], 'EUR')
    expect(r.ok && r.total).toBe(0); expect(r.ok && r.counted).toBe(0)
  })
  it('counts only confirmed extras — conversation does not move money', () => {
    const r = extrasTotal([
      extra({ id: 'a', unit_price: 100, status: 'confirmed' }),
      extra({ id: 'b', unit_price: 500, status: 'accepted' }),
      extra({ id: 'c', unit_price: 900, status: 'offered' }),
      extra({ id: 'd', unit_price: 700, status: 'requested' }),
      extra({ id: 'e', unit_price: 300, status: 'declined' }),
      extra({ id: 'f', unit_price: 400, status: 'withdrawn' }),
    ], 'EUR')
    expect(r.ok && r.total).toBe(100); expect(r.ok && r.counted).toBe(1)
  })
  it('multiplies by quantity', () => {
    expect(extrasTotal([extra({ unit_price: 120, quantity: 3 })], 'EUR').ok && extrasTotal([extra({ unit_price: 120, quantity: 3 })], 'EUR')).toMatchObject({ total: 360 })
  })
  it('treats a missing or nonsense quantity as one rather than zero', () => {
    const r = extrasTotal([extra({ unit_price: 120, quantity: 0 as number })], 'EUR')
    expect(r.ok && r.total).toBe(120)
  })
  it('refuses to total a confirmed extra with no price, and names it', () => {
    const r = extrasTotal([extra({ title: 'Balloon ride', unit_price: null })], 'EUR')
    expect(r.ok).toBe(false); if (r.ok) return
    expect(r.reason).toBe('unpriced'); expect(r.unpriced).toEqual(['Balloon ride'])
  })
  it('excludes a foreign-currency extra instead of converting it', () => {
    const r = extrasTotal([
      extra({ id: 'eur', unit_price: 340, currency: 'EUR' }),
      extra({ id: 'jpy', title: 'Insurance-like', unit_price: 12200, currency: 'JPY' }),
    ], 'EUR')
    expect(r.ok && r.total).toBe(340); expect(r.ok && r.counted).toBe(1)
    expect(r.ok && r.excluded).toEqual([{ id: 'jpy', title: 'Insurance-like', currency: 'JPY', amount: 12200 }])
  })
  it('rounds to the currency, not to two places', () => {
    // A yen with a decimal place is not an amount of money that exists.
    const r = extrasTotal([extra({ unit_price: 1200.4, currency: 'JPY' })], 'JPY')
    expect(r.ok && r.total).toBe(1200)
  })
})

describe('applyExtras', () => {
  it('uses the total as the base on a booking that has never had an extra', () => {
    const r = applyExtras({ baseTotalCost: null, totalCost: 5000, extrasTotal: 340, depositPercent: 20, totalPaid: 0, currency: 'EUR' })
    expect(r.base_total_cost).toBe(5000); expect(r.total_cost).toBe(5340)
  })
  it('keeps the deposit on the base — an extra never restates a deposit invoice', () => {
    const r = applyExtras({ baseTotalCost: 5000, totalCost: 5000, extrasTotal: 1000, depositPercent: 20, totalPaid: 0, currency: 'EUR' })
    expect(r.deposit_amount).toBe(1000); expect(r.total_cost).toBe(6000)
  })
  it('computes balance_due exactly as record_booking_payment() does', () => {
    const r = applyExtras({ baseTotalCost: 5000, totalCost: 5000, extrasTotal: 340, depositPercent: 20, totalPaid: 1000, currency: 'EUR' })
    expect(r.balance_due).toBe(4340)
  })
  it('never reports a negative balance on an overpaid booking', () => {
    expect(applyExtras({ baseTotalCost: 1000, totalCost: 1000, extrasTotal: 0, depositPercent: 20, totalPaid: 1500, currency: 'EUR' }).balance_due).toBe(0)
  })
  it('is idempotent — applying the same extras twice does not compound', () => {
    const first = applyExtras({ baseTotalCost: null, totalCost: 5000, extrasTotal: 340, depositPercent: 20, totalPaid: 0, currency: 'EUR' })
    const second = applyExtras({ baseTotalCost: first.base_total_cost, totalCost: first.total_cost, extrasTotal: 340, depositPercent: 20, totalPaid: 0, currency: 'EUR' })
    expect(second).toEqual(first)
  })
  it('reverses cleanly when the only extra is withdrawn', () => {
    const withExtra = applyExtras({ baseTotalCost: null, totalCost: 5000, extrasTotal: 340, depositPercent: 20, totalPaid: 0, currency: 'EUR' })
    const reversed = applyExtras({ baseTotalCost: withExtra.base_total_cost, totalCost: withExtra.total_cost, extrasTotal: 0, depositPercent: 20, totalPaid: 0, currency: 'EUR' })
    expect(reversed.total_cost).toBe(5000); expect(reversed.extras_total).toBe(0)
  })
  it('rounds the deposit to the currency', () => {
    expect(applyExtras({ baseTotalCost: 1854367, totalCost: 1854367, extrasTotal: 0, depositPercent: 20, totalPaid: 0, currency: 'JPY' }).deposit_amount).toBe(370873)
  })
})

describe('nextStatus', () => {
  const priced = { unit_price: 340, currency: 'EUR' }
  it('walks the customer-initiated path: requested → offered → accepted → confirmed', () => {
    expect(nextStatus('requested', 'price')).toEqual({ ok: true, status: 'offered', moneyMoves: false })
    expect(nextStatus('offered', 'accept', priced)).toEqual({ ok: true, status: 'accepted', moneyMoves: false })
    expect(nextStatus('accepted', 'confirm', priced)).toEqual({ ok: true, status: 'confirmed', moneyMoves: true })
  })
  it('lets the office confirm a priced offer directly — agreed on the phone', () => {
    expect(nextStatus('offered', 'confirm', priced)).toEqual({ ok: true, status: 'confirmed', moneyMoves: true })
  })
  it('allows a re-quote while the extra is still with the customer', () => {
    expect(nextStatus('offered', 'price')).toEqual({ ok: true, status: 'offered', moneyMoves: false })
  })
  it('refuses to confirm an unpriced extra', () => {
    const r = nextStatus('accepted', 'confirm', { unit_price: null, currency: null })
    expect(r.ok).toBe(false); expect(!r.ok && r.reason).toMatch(/Price this extra/)
  })
  it('refuses a price without its currency', () => {
    expect(isPriced({ unit_price: 340, currency: null })).toBe(false)
    expect(nextStatus('accepted', 'confirm', { unit_price: 340, currency: null }).ok).toBe(false)
  })
  it('refuses to accept an extra that has no price yet', () => {
    expect(nextStatus('offered', 'accept', { unit_price: null, currency: 'EUR' }).ok).toBe(false)
  })
  it('reports that money moves when a confirmed extra is withdrawn', () => {
    expect(nextStatus('confirmed', 'withdraw')).toEqual({ ok: true, status: 'withdrawn', moneyMoves: true })
  })
  it('cannot confirm straight from requested — a price has to be agreed first', () => {
    expect(nextStatus('requested', 'confirm', priced).ok).toBe(false)
    expect(nextStatus('requested', 'accept', priced).ok).toBe(false)
  })
  it('treats declined and withdrawn as terminal', () => {
    for (const terminal of ['declined', 'withdrawn'] as ExtraStatus[]) {
      for (const action of ['price', 'accept', 'decline', 'confirm', 'withdraw'] as const) {
        const r = nextStatus(terminal, action, priced)
        expect(r.ok).toBe(false); expect(!r.ok && r.reason).toMatch(/already/)
      }
    }
  })
  it('never lets a confirmed extra be re-confirmed or re-priced', () => {
    expect(nextStatus('confirmed', 'confirm', priced).ok).toBe(false)
    expect(nextStatus('confirmed', 'price', priced).ok).toBe(false)
  })
})

describe('paymentStandingFor', () => {
  it('is paid once what was received covers the total', () => {
    expect(paymentStandingFor({ totalPaid: 5000, totalCost: 5000, depositAmount: 1000 })).toEqual({ payment_status: 'paid', deposit_paid: true })
  })
  it('is deposit_received on exactly the deposit, and partial above it', () => {
    expect(paymentStandingFor({ totalPaid: 1000, totalCost: 5000, depositAmount: 1000 }).payment_status).toBe('deposit_received')
    expect(paymentStandingFor({ totalPaid: 1500, totalCost: 5000, depositAmount: 1000 }).payment_status).toBe('partial')
  })
  it('is pending below the deposit', () => {
    expect(paymentStandingFor({ totalPaid: 400, totalCost: 5000, depositAmount: 1000 })).toEqual({ payment_status: 'pending', deposit_paid: false })
  })
  it('drops a fully-paid booking back to partial when an extra raises the total', () => {
    expect(paymentStandingFor({ totalPaid: 5000, totalCost: 5340, depositAmount: 1000 }).payment_status).toBe('partial')
  })
})

describe('totalPaidFrom', () => {
  it('subtracts refunds', () => {
    expect(totalPaidFrom([{ amount: 2000, payment_type: 'payment', currency: 'EUR' }, { amount: 500, payment_type: 'refund', currency: 'EUR' }], 'EUR')).toBe(1500)
  })
  it('ignores a payment in another currency, as the database does', () => {
    expect(totalPaidFrom([{ amount: 2000, payment_type: 'payment', currency: 'EUR' }, { amount: 900000, payment_type: 'payment', currency: 'JPY' }], 'EUR')).toBe(2000)
  })
  it('treats a payment with no currency as the booking currency', () => {
    expect(totalPaidFrom([{ amount: 2000, payment_type: 'payment', currency: null }], 'EUR')).toBe(2000)
  })
})

describe('lineAmount', () => {
  it('is null for an unpriced extra rather than zero', () => { expect(lineAmount(extra({ unit_price: null }))).toBeNull() })
  it('multiplies unit price by quantity in the extra own currency', () => { expect(lineAmount(extra({ unit_price: 12200, quantity: 2, currency: 'JPY' }))).toBe(24400) })
})
