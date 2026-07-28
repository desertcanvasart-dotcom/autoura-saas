import { describe, it, expect } from 'vitest'
import { daysOverdueOrNull } from '@/lib/invoice-dates'

// ============================================================================
// invoices.due_date is nullable and the dunning ladder compares against it.
// NaN loses every comparison, so a missing due date fell past every rung to
// the harshest one: the client received "Final Notice — your payment is now
// NaN days overdue". Blank field, maximum aggression, straight to a customer.
// ============================================================================

const NOW = new Date('2026-07-28T12:00:00Z').getTime()

describe('daysOverdueOrNull', () => {
  it('returns null for every unusable due date', () => {
    for (const bad of [null, undefined, '', 'not-a-date', 'TBD']) {
      expect(daysOverdueOrNull(bad, NOW), String(bad)).toBeNull()
    }
  })

  it('never returns NaN — the value that caused the bug', () => {
    for (const bad of [null, undefined, '', 'garbage']) {
      const r = daysOverdueOrNull(bad, NOW)
      expect(Number.isNaN(r as number), String(bad)).toBe(false)
    }
  })

  it('counts days overdue for a past due date', () => {
    expect(daysOverdueOrNull('2026-07-14T12:00:00Z', NOW)).toBe(14)
    expect(daysOverdueOrNull('2026-07-27T12:00:00Z', NOW)).toBe(1)
  })

  it('is negative before the due date', () => {
    expect(daysOverdueOrNull('2026-08-04T12:00:00Z', NOW)).toBe(-7)
  })

  it('is 0 on the due date', () => {
    expect(daysOverdueOrNull('2026-07-28T12:00:00Z', NOW)).toBe(0)
  })

  it('the escalation ladder cannot reach Final Notice without a real date', () => {
    // Mirrors the route: null short-circuits BEFORE any threshold compare.
    const pick = (due: unknown) => {
      const d = daysOverdueOrNull(due, NOW)
      if (d === null) return 'skipped'
      if (d <= -7) return 'before_due_7'
      if (d <= 0) return 'on_due'
      if (d <= 14) return 'overdue_14'
      return 'overdue_30'
    }
    expect(pick(null)).toBe('skipped')
    expect(pick('')).toBe('skipped')
    // and a genuinely old invoice still escalates properly
    expect(pick('2026-05-01T12:00:00Z')).toBe('overdue_30')
  })
})
