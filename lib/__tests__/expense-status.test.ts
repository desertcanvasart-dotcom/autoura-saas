import { describe, it, expect } from 'vitest'
import { expenseStatusUpdate } from '@/lib/expense-status'

// Approve / Mark as paid used to be dropped by the expense PUT; the status
// now moves, and the payment date with it.

describe('expenseStatusUpdate', () => {
  it('approving clears any payment date', () => {
    expect(expenseStatusUpdate('approved')).toEqual({ status: 'approved', payment_date: null })
  })
  it('paying stamps the given date, else today', () => {
    expect(expenseStatusUpdate('paid', '2026-10-01')).toEqual({ status: 'paid', payment_date: '2026-10-01' })
    expect(expenseStatusUpdate('paid', '')).toEqual({ status: 'paid', payment_date: new Date().toISOString().slice(0, 10) })
  })
  it('refuses anything else', () => {
    expect(expenseStatusUpdate('confirmed')).toBeNull()
    expect(expenseStatusUpdate(undefined)).toBeNull()
  })
})
