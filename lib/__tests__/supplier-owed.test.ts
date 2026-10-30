import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { owedState, owedView, type OwedSource } from '@/lib/supplier-owed'

const exp = (over: Partial<OwedSource>): OwedSource => ({
  id: Math.random().toString(36).slice(2), amount: 100, currency: 'egp', status: 'pending',
  expense_date: '2026-11-01', payment_date: null, booking_supplier_status_id: 'l1', ...over,
})
const serviceOf = (id: string) => ({ l1: 'Airport pickup', l2: 'Day tour' } as Record<string, string>)[id] ?? null
const TODAY = '2026-11-05'

describe('what a supplier is owed', () => {
  it('to approve = being checked, approved = to be paid, paid = paid; rejected not shown', () => {
    expect(owedState('pending')).toBe('checking')
    expect(owedState('approved')).toBe('to_pay')
    expect(owedState('paid')).toBe('paid')
    expect(owedState('rejected')).toBeNull()
  })

  it('totals what is not yet paid, per currency; paid is listed, not totalled', () => {
    const v = owedView([
      exp({ amount: 100 }), exp({ amount: '50.5', status: 'approved', booking_supplier_status_id: 'l2' }),
      exp({ amount: 30, currency: 'USD' }), exp({ amount: 999, status: 'paid', payment_date: '2026-11-03' }),
      exp({ amount: 70, status: 'rejected' }),
    ], serviceOf, TODAY)
    expect(v.unpaid).toEqual([{ currency: 'EGP', amount: 150.5 }, { currency: 'USD', amount: 30 }])
    expect(v.items).toHaveLength(4)
    expect(v.items.find(i => i.state === 'paid')).toMatchObject({ amount: 999, paidOn: '2026-11-03' })
  })

  it('names the service, never the expense notes; skips anything not from their service lines, empty amounts, old payments', () => {
    const v = owedView([
      exp({ booking_supplier_status_id: null }), exp({ amount: 0 }), exp({ amount: null }),
      exp({ status: 'paid', payment_date: '2026-06-01' }), exp({ booking_supplier_status_id: 'l2' }),
    ], serviceOf, TODAY)
    expect(v.items.map(i => i.service)).toEqual(['Day tour'])
  })

  it('the page reads only this supplier’s line expenses at this agency, and never the notes', () => {
    const page = readFileSync('lib/supplier-page-data.ts', 'utf8')
    const q = page.slice(page.indexOf(".from('expenses')"), page.indexOf('.limit(300)'))
    expect(q).toContain(".eq('tenant_id', tenantId).eq('supplier_id', supplierId).not('booking_supplier_status_id', 'is', null)")
    expect(q).not.toMatch(/notes|description|receipt/)
  })
})
