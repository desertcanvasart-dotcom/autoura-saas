// Audit of 2026-10-09, round 3 (lower items): template due dates were
// invented (deposit today + 7, balance 14 days before departure); quote
// messages printed "EUR 1,250.5" and an ambiguous 11/8/2026.
import { describe, it, expect } from 'vitest'
import { buildPlaceholderData, depositDueDate } from '@/lib/template-placeholders'
import { formatMoney } from '@/lib/currency-totals'

describe('template due dates follow the agency’s terms', () => {
  it('the deposit is due after the agency’s deposit days', () => {
    const today = new Date('2026-10-09T12:00:00Z')
    expect(depositDueDate(14, today).toISOString().slice(0, 10)).toBe('2026-10-23')
    expect(depositDueDate(null, today).toISOString().slice(0, 10)).toBe('2026-10-16')
  })
  it('the balance is due by departure — not an invented 14 days before', () => {
    const data = buildPlaceholderData({ name: 'Ada' }, { startDate: '2026-11-20' }, { depositDueDays: 10 })
    expect(data.final_payment_due).toMatch(/20/)
    expect(data.final_payment_due).not.toMatch(/\b6\b/)
  })
})

describe('quote money', () => {
  it('two decimals and separators, never "EUR 1,250.5"', () => {
    expect(formatMoney(1250.5, 'EUR')).toMatch(/1,250\.50$/)
  })
})
