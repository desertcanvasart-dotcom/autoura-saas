import { describe, it, expect } from 'vitest'
import {
  computeUsageWindow,
  resolveUsageAnchor,
  windowKeys,
  isWithinWindow,
} from '@/lib/usage-window'

// ============================================================================
// Metered limits are meaningless if the window never rolls over.
//
// `tenant_usage.period_start` only advances when the Stripe webhook writes
// `tenant_subscriptions.current_period_start`. Every tenant without a Stripe
// subscription — all of them today, and every trial tenant by definition — has
// a frozen window, so a "monthly" meter would accumulate forever and
// eventually block everyone.
//
// These tests pin the computed alternative: the window IS whatever the anchor
// implies right now. No scheduled job, nothing to fail silently.
// ============================================================================

const iso = (d: Date) => d.toISOString().slice(0, 10)

describe('monthly window — rolls over without anything scheduled', () => {
  it('contains now, starting on the anchor day', () => {
    const w = computeUsageWindow('2026-07-15T09:30:00Z', 'monthly', '2026-07-20T00:00:00Z')
    expect(iso(w.start)).toBe('2026-07-15')
    expect(iso(w.end)).toBe('2026-08-15')
  })

  it('is still the PREVIOUS window before this month’s anniversary', () => {
    const w = computeUsageWindow('2026-07-15T09:30:00Z', 'monthly', '2026-08-14T23:00:00Z')
    expect(iso(w.start)).toBe('2026-07-15')
    expect(iso(w.end)).toBe('2026-08-15')
  })

  it('rolls the instant the anniversary passes', () => {
    const anchor = '2026-07-15T09:30:00Z'
    const before = computeUsageWindow(anchor, 'monthly', '2026-08-15T09:29:59Z')
    const after = computeUsageWindow(anchor, 'monthly', '2026-08-15T09:30:00Z')
    expect(iso(before.start)).toBe('2026-07-15')
    expect(iso(after.start)).toBe('2026-08-15')
  })

  it('keeps the anchor time-of-day, so windows do not tick at midnight', () => {
    const w = computeUsageWindow('2026-07-15T09:30:00Z', 'monthly', '2026-07-20T00:00:00Z')
    expect(w.start.toISOString()).toBe('2026-07-15T09:30:00.000Z')
  })

  it('crosses a year boundary', () => {
    const w = computeUsageWindow('2026-01-10T00:00:00Z', 'monthly', '2026-12-20T00:00:00Z')
    expect(iso(w.start)).toBe('2026-12-10')
    expect(iso(w.end)).toBe('2027-01-10')
  })

  it('handles December -> January without arithmetic overflow', () => {
    const w = computeUsageWindow('2026-03-05T00:00:00Z', 'monthly', '2027-01-02T00:00:00Z')
    expect(iso(w.start)).toBe('2026-12-05')
    expect(iso(w.end)).toBe('2027-01-05')
  })
})

describe('month-end clamping is STICKY', () => {
  // Approved rule: Jan 31 -> Feb 28 -> Mar 31. The day clamps to each month's
  // length but is always re-derived from the ORIGINAL anchor, so it snaps back.
  const JAN31 = '2026-01-31T12:00:00Z'

  it('clamps a 31st anchor into February', () => {
    const w = computeUsageWindow(JAN31, 'monthly', '2026-02-10T00:00:00Z')
    expect(iso(w.start)).toBe('2026-01-31')
    expect(iso(w.end)).toBe('2026-02-28')
  })

  it('SNAPS BACK to the 31st in March — the anniversary must not drift', () => {
    const w = computeUsageWindow(JAN31, 'monthly', '2026-03-15T00:00:00Z')
    expect(iso(w.start)).toBe('2026-02-28')
    expect(iso(w.end)).toBe('2026-03-31')
  })

  it('clamps to 30 in a 30-day month, then returns to 31', () => {
    expect(iso(computeUsageWindow(JAN31, 'monthly', '2026-04-15T00:00:00Z').start)).toBe('2026-03-31')
    expect(iso(computeUsageWindow(JAN31, 'monthly', '2026-04-15T00:00:00Z').end)).toBe('2026-04-30')
    expect(iso(computeUsageWindow(JAN31, 'monthly', '2026-05-15T00:00:00Z').start)).toBe('2026-04-30')
    expect(iso(computeUsageWindow(JAN31, 'monthly', '2026-05-15T00:00:00Z').end)).toBe('2026-05-31')
  })

  it('clamps a 30th anchor into February', () => {
    const w = computeUsageWindow('2026-01-30T00:00:00Z', 'monthly', '2026-02-15T00:00:00Z')
    expect(iso(w.end)).toBe('2026-02-28')
  })

  it('uses Feb 29 in a leap year', () => {
    const w = computeUsageWindow('2028-01-31T00:00:00Z', 'monthly', '2028-02-15T00:00:00Z')
    expect(iso(w.end)).toBe('2028-02-29')
  })

  it('leaves NO GAP between a clamped window and the next', () => {
    // The 28th->31st gap is the bug that naive clamping produces.
    const feb = computeUsageWindow(JAN31, 'monthly', '2026-02-10T00:00:00Z')
    const mar = computeUsageWindow(JAN31, 'monthly', '2026-03-15T00:00:00Z')
    expect(feb.end.toISOString()).toBe(mar.start.toISOString())
  })

  it('covers every instant across a clamped boundary', () => {
    const probe = new Date('2026-02-28T11:59:59Z')
    const w = computeUsageWindow(JAN31, 'monthly', probe)
    expect(isWithinWindow(w, probe)).toBe(true)
  })
})

describe('annual window', () => {
  it('contains now, anchored on month and day', () => {
    const w = computeUsageWindow('2026-07-21T00:00:00Z', 'annual', '2026-11-01T00:00:00Z')
    expect(iso(w.start)).toBe('2026-07-21')
    expect(iso(w.end)).toBe('2027-07-21')
  })

  it('is the previous year before the anniversary — no calendar-year reset', () => {
    // The whole point of anniversary anchoring: a November subscriber must not
    // lose their annual allowance six weeks later on 1 January.
    const w = computeUsageWindow('2026-11-15T00:00:00Z', 'annual', '2027-01-05T00:00:00Z')
    expect(iso(w.start)).toBe('2026-11-15')
    expect(iso(w.end)).toBe('2027-11-15')
  })

  it('rolls exactly on the anniversary', () => {
    const anchor = '2026-07-21T10:00:00Z'
    expect(iso(computeUsageWindow(anchor, 'annual', '2027-07-20T23:59:59Z').start)).toBe('2026-07-21')
    expect(iso(computeUsageWindow(anchor, 'annual', '2027-07-21T10:00:00Z').start)).toBe('2027-07-21')
  })

  it('clamps a Feb 29 anchor to Feb 28 in a common year, and back in a leap year', () => {
    const anchor = '2024-02-29T00:00:00Z'
    expect(iso(computeUsageWindow(anchor, 'annual', '2025-06-01T00:00:00Z').start)).toBe('2025-02-28')
    expect(iso(computeUsageWindow(anchor, 'annual', '2028-06-01T00:00:00Z').start)).toBe('2028-02-29')
  })
})

describe('windows are contiguous and half-open', () => {
  it('the end instant belongs to the NEXT window, never both', () => {
    const anchor = '2026-07-15T09:30:00Z'
    const w = computeUsageWindow(anchor, 'monthly', '2026-07-20T00:00:00Z')
    expect(isWithinWindow(w, w.start)).toBe(true)
    expect(isWithinWindow(w, w.end)).toBe(false)

    const next = computeUsageWindow(anchor, 'monthly', w.end)
    expect(next.start.toISOString()).toBe(w.end.toISOString())
  })

  it('twelve consecutive monthly windows tile the year with no gaps', () => {
    const anchor = '2026-01-31T00:00:00Z'
    let cursor = computeUsageWindow(anchor, 'monthly', '2026-01-31T00:00:00Z')
    for (let i = 0; i < 12; i++) {
      const next = computeUsageWindow(anchor, 'monthly', cursor.end)
      expect(next.start.toISOString(), `gap after ${cursor.end.toISOString()}`).toBe(cursor.end.toISOString())
      cursor = next
    }
  })
})

describe('resolveUsageAnchor', () => {
  it('prefers the subscription period start', () => {
    const anchor = resolveUsageAnchor({
      subscriptionPeriodStart: '2026-07-21T00:00:00Z',
      tenantCreatedAt: '2026-01-01T00:00:00Z',
    })
    expect(iso(anchor!)).toBe('2026-07-21')
  })

  it('falls back to tenant creation, so a pre-billing tenant still rolls over', () => {
    const anchor = resolveUsageAnchor({
      subscriptionPeriodStart: null,
      tenantCreatedAt: '2026-07-15T00:00:00Z',
    })
    expect(iso(anchor!)).toBe('2026-07-15')
  })

  it('returns null when nothing is known — the caller must fail OPEN', () => {
    expect(resolveUsageAnchor({})).toBeNull()
    expect(resolveUsageAnchor({ subscriptionPeriodStart: null, tenantCreatedAt: null })).toBeNull()
  })

  it('ignores an unparseable date rather than producing an invalid window', () => {
    const anchor = resolveUsageAnchor({
      subscriptionPeriodStart: 'not-a-date',
      tenantCreatedAt: '2026-07-15T00:00:00Z',
    })
    expect(iso(anchor!)).toBe('2026-07-15')
  })
})

describe('guards', () => {
  it('throws on an invalid anchor rather than silently bucketing to epoch', () => {
    expect(() => computeUsageWindow('nonsense', 'monthly', '2026-07-20T00:00:00Z')).toThrow(/invalid anchor/)
  })

  it('throws on an invalid now', () => {
    expect(() => computeUsageWindow('2026-07-15T00:00:00Z', 'monthly', 'nonsense')).toThrow(/invalid now/)
  })

  it('handles an anchor in the future without throwing', () => {
    // A subscription starting later: usage recorded now must land somewhere.
    const w = computeUsageWindow('2026-09-01T00:00:00Z', 'monthly', '2026-07-20T00:00:00Z')
    expect(isWithinWindow(w, '2026-07-20T00:00:00Z')).toBe(true)
    expect(w.end.getTime()).toBeLessThanOrEqual(new Date('2026-09-01T00:00:00Z').getTime())
  })
})

describe('windowKeys', () => {
  it('renders the tenant_usage row key', () => {
    const w = computeUsageWindow('2026-07-15T09:30:00Z', 'monthly', '2026-07-20T00:00:00Z')
    expect(windowKeys(w)).toEqual({
      period_start: '2026-07-15T09:30:00.000Z',
      period_end: '2026-08-15T09:30:00.000Z',
    })
  })
})

describe('the five live tenants roll over correctly', () => {
  // Real anchors from the approved mapping, all mid-month so none hit clamping.
  const ANCHORS = {
    'Autoura Sandbox': '2026-07-15T00:00:00Z',
    'Sawa Tours': '2026-07-16T00:00:00Z',
    'Sillage Egypte': '2026-07-16T00:00:00Z',
    'Travel2Egypt': '2026-07-21T00:00:00Z',
    'Afford Egypt': '2026-07-21T00:00:00Z',
  }

  it('each gets a fresh monthly window a month after assignment', () => {
    for (const [name, anchor] of Object.entries(ANCHORS)) {
      const now = computeUsageWindow(anchor, 'monthly', anchor)
      const later = computeUsageWindow(anchor, 'monthly', new Date(new Date(anchor).getTime() + 40 * 86400000))
      expect(later.start.getTime(), name).toBeGreaterThan(now.start.getTime())
    }
  })

  it('annual windows do not reset at new year', () => {
    for (const [name, anchor] of Object.entries(ANCHORS)) {
      const w = computeUsageWindow(anchor, 'annual', '2027-01-15T00:00:00Z')
      expect(w.start.getUTCFullYear(), name).toBe(2026)
      expect(w.end.getUTCFullYear(), name).toBe(2027)
    }
  })
})
