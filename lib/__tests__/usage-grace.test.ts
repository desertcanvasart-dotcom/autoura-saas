import { describe, it, expect } from 'vitest'
import {
  classifyUsage,
  describeBand,
  shouldAlert,
  WARN_AT,
  OVERAGE_AT,
  HARD_STOP_AT,
} from '@/lib/usage-grace'

// ============================================================================
// Volume limits must not wall an operator mid-season.
//
// A DMC in February peak, quoting a waiting client, hitting "annual limit
// reached" is a churn event — we would be blocking the thing that makes them
// money at the moment it makes them money. So: warn at 80%, ALLOW overage at
// 100%, stop only at 125%.
//
// The boundaries are the whole behaviour, so they are tested exactly rather
// than approximately.
// ============================================================================

describe('band boundaries — exact', () => {
  const LIMIT = 100 // makes current == percentage

  it('is silent below 80%', () => {
    expect(classifyUsage(0, LIMIT).band).toBe('ok')
    expect(classifyUsage(79, LIMIT).band).toBe('ok')
  })

  it('warns from exactly 80%', () => {
    expect(classifyUsage(79.9, LIMIT).band).toBe('ok')
    expect(classifyUsage(80, LIMIT).band).toBe('warning')
    expect(classifyUsage(99, LIMIT).band).toBe('warning')
  })

  it('enters overage at exactly 100% — and STILL ALLOWS', () => {
    expect(classifyUsage(99.9, LIMIT).band).toBe('warning')
    const at = classifyUsage(100, LIMIT)
    expect(at.band).toBe('overage')
    expect(at.allowed).toBe(true)
    expect(at.inOverage).toBe(true)
  })

  it('keeps allowing through the overage band', () => {
    for (const current of [101, 110, 124]) {
      const a = classifyUsage(current, LIMIT)
      expect(a.band, `${current}`).toBe('overage')
      expect(a.allowed, `${current}`).toBe(true)
    }
  })

  it('stops at exactly 125%', () => {
    expect(classifyUsage(124.9, LIMIT).allowed).toBe(true)
    const stop = classifyUsage(125, LIMIT)
    expect(stop.band).toBe('blocked')
    expect(stop.allowed).toBe(false)
  })

  it('stays blocked beyond the stop', () => {
    expect(classifyUsage(500, LIMIT).allowed).toBe(false)
  })

  it('uses the documented constants, not magic numbers', () => {
    expect(WARN_AT).toBe(0.8)
    expect(OVERAGE_AT).toBe(1.0)
    expect(HARD_STOP_AT).toBe(1.25)
  })
})

describe('real plan limits', () => {
  it('Solo: 120 itineraries/yr warns at 96, allows to 149, stops at 150', () => {
    expect(classifyUsage(95, 120).band).toBe('ok')
    expect(classifyUsage(96, 120).band).toBe('warning')
    expect(classifyUsage(120, 120).band).toBe('overage')
    expect(classifyUsage(149, 120).allowed).toBe(true)
    expect(classifyUsage(150, 120).allowed).toBe(false)
  })

  it('Solo: 50 AI generations/mo stops at 63 (62.5 rounded up by the ratio)', () => {
    expect(classifyUsage(50, 50).band).toBe('overage')
    expect(classifyUsage(62, 50).allowed).toBe(true)
    // 62.5/50 = 1.25 exactly -> blocked
    expect(classifyUsage(62.5, 50).allowed).toBe(false)
    expect(classifyUsage(63, 50).allowed).toBe(false)
  })

  it('Studio: 500 itineraries/yr gives 125 of headroom past the plan', () => {
    expect(classifyUsage(499, 500).band).toBe('warning')
    expect(classifyUsage(624, 500).allowed).toBe(true)
    expect(classifyUsage(625, 500).allowed).toBe(false)
  })
})

describe('unlimited and degenerate limits', () => {
  it('treats a null limit as unlimited', () => {
    const a = classifyUsage(999999, null)
    expect(a.band).toBe('ok')
    expect(a.allowed).toBe(true)
    expect(a.ratio).toBeNull()
    expect(a.remainingBeforeStop).toBeNull()
  })

  it('a zero limit blocks immediately — never Infinity or NaN', () => {
    const a = classifyUsage(0, 0)
    expect(a.band).toBe('blocked')
    expect(a.allowed).toBe(false)
    expect(Number.isNaN(a.ratio as number)).toBe(false)
  })

  it('a negative limit blocks rather than inverting the comparison', () => {
    expect(classifyUsage(5, -10).allowed).toBe(false)
  })

  it('non-finite or negative usage fails open rather than producing NaN', () => {
    expect(classifyUsage(NaN, 100).allowed).toBe(true)
    expect(classifyUsage(-5, 100).allowed).toBe(true)
  })
})

describe('remainingBeforeStop', () => {
  it('counts down to the hard stop, not to the plan limit', () => {
    // Limit 100, stop at 125. At 100 used, 25 remain before the stop.
    expect(classifyUsage(100, 100).remainingBeforeStop).toBe(25)
    expect(classifyUsage(120, 100).remainingBeforeStop).toBe(5)
  })

  it('is zero once blocked, never negative', () => {
    expect(classifyUsage(200, 100).remainingBeforeStop).toBe(0)
  })

  it('is unbounded when unlimited', () => {
    expect(classifyUsage(10, null).remainingBeforeStop).toBeNull()
  })
})

describe('describeBand — an overage is a conversation, not an error', () => {
  const opts = { metricLabel: 'itineraries this year', current: 0, limit: 120 }

  it('says nothing while ok', () => {
    expect(describeBand(classifyUsage(10, 120), opts)).toBeNull()
  })

  it('states plain numbers when warning', () => {
    const msg = describeBand(classifyUsage(100, 120), { ...opts, current: 100 })
    expect(msg).toContain('100')
    expect(msg).toContain('120')
  })

  it('reassures that everything still works during overage', () => {
    const msg = describeBand(classifyUsage(125, 120), { ...opts, current: 125 })!
    expect(msg).toMatch(/still works/i)
    expect(msg).not.toMatch(/error|failed/i)
  })

  it('promises existing records stay available when blocked', () => {
    // Over-limit blocks creation only — it must never read as data loss.
    const msg = describeBand(classifyUsage(150, 120), { ...opts, current: 150 })!
    expect(msg).toMatch(/stay available/i)
    expect(msg).toMatch(/upgrade/i)
  })
})

describe('shouldAlert — on entry to a band, not on every action', () => {
  it('alerts when crossing into a new band', () => {
    expect(shouldAlert('warning', 'overage')).toBe(true)
    expect(shouldAlert('ok', 'warning')).toBe(true)
    expect(shouldAlert(null, 'overage')).toBe(true)
  })

  it('does not re-alert within the same band', () => {
    expect(shouldAlert('overage', 'overage')).toBe(false)
  })

  it('never alerts for ok', () => {
    expect(shouldAlert('warning', 'ok')).toBe(false)
    expect(shouldAlert(null, 'ok')).toBe(false)
  })
})
