// ============================================
// Checks on a commission's type, status, money and dates
// ============================================

import { SUPPORTED_CURRENCIES } from '@/lib/currency'

export const COMMISSION_TYPES = ['receivable', 'payable'] as const
export const COMMISSION_STATUSES = ['pending', 'invoiced', 'received', 'paid', 'cancelled', 'disputed'] as const
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** What is wrong with these commission fields, or null. Only fields present are checked; numbers are normalised in place. */
export function checkCommissionFields(data: Record<string, unknown>): string | null {
  if (data.commission_type !== undefined && !(COMMISSION_TYPES as readonly string[]).includes(String(data.commission_type))) {
    return `Type must be ${COMMISSION_TYPES.join(' or ')}`
  }
  if (data.status !== undefined && !(COMMISSION_STATUSES as readonly string[]).includes(String(data.status))) {
    return `Status must be one of ${COMMISSION_STATUSES.join(', ')}`
  }
  if (data.commission_amount !== undefined) {
    const n = Number(data.commission_amount)
    if (data.commission_amount === null || !Number.isFinite(n) || n <= 0) return 'Commission amount must be a number above 0'
    data.commission_amount = n
  }
  if (data.base_amount !== undefined && data.base_amount !== null) {
    const n = Number(data.base_amount)
    if (!Number.isFinite(n) || n < 0) return 'Base amount must be 0 or more'
    data.base_amount = n
  }
  if (data.commission_rate !== undefined && data.commission_rate !== null) {
    const n = Number(data.commission_rate)
    if (!Number.isFinite(n) || n < 0 || n > 100) return 'Rate is a percentage from 0 to 100'
    data.commission_rate = n
  }
  if (data.currency !== undefined && data.currency !== null) {
    const c = String(data.currency).trim().toUpperCase()
    if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(c)) return `Currency "${c}" is not supported`
    data.currency = c
  }
  for (const k of ['transaction_date', 'due_date', 'paid_date']) {
    const v = data[k]
    if (v !== undefined && v !== null && !(typeof v === 'string' && DAY.test(v.slice(0, 10)))) return `${k.replace('_', ' ')} must be a date (YYYY-MM-DD)`
  }
  return null
}
