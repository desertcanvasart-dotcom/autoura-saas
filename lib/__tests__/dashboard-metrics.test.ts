import { describe, it, expect } from 'vitest'
import {
  money,
  daysUntil,
  isDepartingSoon,
  summariseOutstanding,
  summariseQuotes,
  isEngagedProposal,
  byMostRecentlyViewed,
  DEPARTURE_WINDOW_DAYS,
} from '@/lib/dashboard-metrics'

// ============================================================================
// The dashboard is the first thing an operator reads each morning, so a wrong
// number here is worse than a missing one: they act on it. These pin the rules
// where this codebase has been burned before — null dates becoming NaN, and
// numerics arriving from Postgres as strings.
// ============================================================================

const NOW = new Date('2026-07-28T12:00:00Z').getTime()

describe('money', () => {
  it('accepts the string form Postgres actually returns', () => {
    expect(money('1234.50')).toBe(1234.5)
    expect(money(1234.5)).toBe(1234.5)
  })

  it('is 0 — never NaN — for anything unusable', () => {
    for (const bad of [null, undefined, '', 'abc', {}, []]) {
      const r = money(bad)
      expect(Number.isNaN(r), String(bad)).toBe(false)
      expect(r).toBe(0)
    }
  })
})

describe('daysUntil', () => {
  it('returns null rather than NaN for unusable dates', () => {
    for (const bad of [null, undefined, '', 'TBD', 'not-a-date']) {
      expect(daysUntil(bad, NOW), String(bad)).toBeNull()
    }
  })

  it('is 0 today, positive in future, negative in past', () => {
    expect(daysUntil('2026-07-28T23:00:00Z', NOW)).toBe(0)
    expect(daysUntil('2026-08-04T00:00:00Z', NOW)).toBe(7)
    expect(daysUntil('2026-07-21T00:00:00Z', NOW)).toBe(-7)
  })

  it('anchors to midnight, so a later hour today is still today', () => {
    // Naive ms-division would call this 0.4 days and floor inconsistently.
    expect(daysUntil('2026-07-28T01:00:00Z', NOW)).toBe(0)
  })

  it('is UTC-anchored, so the answer does not depend on the host timezone', () => {
    // This caught a real bug: local-midnight anchoring made the same trip
    // read as departing today on one machine and tomorrow on another.
    const original = process.env.TZ
    const results: (number | null)[] = []
    for (const tz of ['UTC', 'Africa/Cairo', 'America/Los_Angeles']) {
      process.env.TZ = tz
      results.push(daysUntil('2026-07-28T23:00:00Z', NOW))
    }
    process.env.TZ = original
    expect(new Set(results).size, 'same input must give one answer').toBe(1)
    expect(results[0]).toBe(0)
  })
})

describe('isDepartingSoon', () => {
  it('includes today and the far edge of the window', () => {
    expect(isDepartingSoon({ start_date: '2026-07-28' }, NOW)).toBe(true)
    expect(isDepartingSoon({ start_date: '2026-08-11' }, NOW)).toBe(true) // +14
  })

  it('excludes trips that already left', () => {
    expect(isDepartingSoon({ start_date: '2026-07-27' }, NOW)).toBe(false)
  })

  it('excludes trips beyond the window', () => {
    expect(isDepartingSoon({ start_date: '2026-08-12' }, NOW)).toBe(false)
  })

  it('EXCLUDES an unscheduled trip rather than raising a false alarm', () => {
    // Production has an itinerary with a null start_date right now. On the one
    // card meant to be trusted, a date-less trip must not appear as urgent.
    expect(isDepartingSoon({ start_date: null }, NOW)).toBe(false)
    expect(isDepartingSoon({}, NOW)).toBe(false)
  })

  it('the window constant is what the card advertises', () => {
    expect(DEPARTURE_WINDOW_DAYS).toBe(14)
  })
})

describe('summariseOutstanding', () => {
  const rows = [
    { balance_due: '500.00', due_date: '2026-07-01' },   // overdue
    { balance_due: '250.50', due_date: '2026-08-30' },   // not yet due
    { balance_due: '100.00', due_date: null },           // outstanding, NOT late
    { balance_due: '0', due_date: '2026-01-01' },        // settled, ignored
  ]

  it('totals what is owed and counts only real balances', () => {
    const s = summariseOutstanding(rows, NOW)
    expect(s.total).toBe(850.5)
    expect(s.count).toBe(3) // the zero-balance row is not outstanding
  })

  it('a null due date is outstanding but NEVER overdue', () => {
    const s = summariseOutstanding(rows, NOW)
    expect(s.overdueCount).toBe(1)
    expect(s.overdueTotal).toBe(500)
  })

  it('does not surface floating-point dust', () => {
    const s = summariseOutstanding(
      [{ balance_due: '0.10', due_date: null }, { balance_due: '0.20', due_date: null }],
      NOW
    )
    expect(s.total).toBe(0.3) // not 0.30000000000000004
  })

  it('handles empty and null input', () => {
    for (const v of [[], null, undefined]) {
      const s = summariseOutstanding(v as [], NOW)
      expect(s).toEqual({ total: 0, count: 0, overdueCount: 0, overdueTotal: 0 })
    }
  })
})

describe('summariseQuotes', () => {
  it('measures staleness from sent_at, not creation', () => {
    const s = summariseQuotes([
      { sent_at: '2026-07-20', valid_until: '2026-08-30' }, // 8 days ago -> stale
      { sent_at: '2026-07-27', valid_until: '2026-08-30' }, // yesterday  -> fresh
    ], NOW)
    expect(s.staleCount).toBe(1)
    expect(s.awaitingCount).toBe(2)
  })

  it('an unsent quote is not waiting on the client', () => {
    const s = summariseQuotes([{ sent_at: null, valid_until: '2026-08-30' }], NOW)
    expect(s.staleCount).toBe(0)
  })

  it('counts expiry independently of staleness', () => {
    const s = summariseQuotes([
      { sent_at: '2026-07-27', valid_until: '2026-07-01' }, // fresh but expired
    ], NOW)
    expect(s.staleCount).toBe(0)
    expect(s.expiredCount).toBe(1)
  })

  it('a missing valid_until never counts as expired', () => {
    expect(summariseQuotes([{ sent_at: '2026-07-27', valid_until: null }], NOW).expiredCount).toBe(0)
  })
})

describe('isEngagedProposal', () => {
  it('is true only for an unrevoked link the client opened', () => {
    expect(isEngagedProposal({ view_count: 3, last_viewed_at: '2026-07-28' })).toBe(true)
  })

  it('excludes never-opened proposals', () => {
    expect(isEngagedProposal({ view_count: 0 })).toBe(false)
    expect(isEngagedProposal({})).toBe(false)
  })

  it('excludes revoked links — a dead URL is not a live signal', () => {
    expect(isEngagedProposal({ view_count: 9, revoked_at: '2026-07-27' })).toBe(false)
  })
})

describe('byMostRecentlyViewed', () => {
  it('puts the most recently opened proposal first', () => {
    const rows = [
      { last_viewed_at: '2026-07-20T10:00:00Z' },
      { last_viewed_at: '2026-07-28T09:00:00Z' },
      { last_viewed_at: null },
    ]
    const sorted = [...rows].sort(byMostRecentlyViewed)
    expect(sorted[0].last_viewed_at).toBe('2026-07-28T09:00:00Z')
    expect(sorted[2].last_viewed_at).toBeNull()
  })
})
