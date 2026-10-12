// ============================================
// Checks on an expense's money, currency, dates and receipt link
// ============================================
// The routes stored what they were sent: a negative amount, "abc" (a 500),
// a currency the app cannot convert, a receipt "link" that was script.

import { SUPPORTED_CURRENCIES } from '@/lib/currency'

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** What is wrong with these expense fields, or null. Only fields present are checked. */
export function checkExpenseFields(data: Record<string, unknown>): string | null {
  if (data.amount !== undefined) {
    const n = Number(data.amount)
    if (data.amount === null || data.amount === '' || !Number.isFinite(n) || n <= 0) return 'Amount must be a number above 0'
    data.amount = n
  }
  if (data.currency !== undefined && data.currency !== null) {
    const c = String(data.currency).trim().toUpperCase()
    if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(c)) return `Currency "${c}" is not supported`
    data.currency = c
  }
  for (const k of ['expense_date', 'payment_date']) {
    const v = data[k]
    if (v !== undefined && v !== null && !(typeof v === 'string' && DAY.test(v.slice(0, 10)))) return `${k.replace('_', ' ')} must be a date (YYYY-MM-DD)`
  }
  if (data.receipt_url !== undefined && data.receipt_url !== null) {
    if (!/^https?:\/\//i.test(String(data.receipt_url))) return 'The receipt link must start with http:// or https://'
  }
  return null
}
