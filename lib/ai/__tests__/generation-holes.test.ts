import { describe, it, expect } from 'vitest'
import {
  createHoleCollector,
  requireRates,
  describeHoles,
  unpricedSummary,
} from '@/lib/ai/generation-holes'

// ============================================================================
// The AI generator used to substitute constants when a rate lookup failed:
// €25 airport, €15 hotel service, €12 lunch, €18 dinner, and a silent €0 for
// vehicle and guide. Those figures were written to `itineraries` as total_cost
// / total_revenue / profit with status 'quoted', and the send-path gate could
// not catch them — checkAmountDeliverable validates arithmetic, not provenance.
//
// These tests pin the replacement: a failed lookup must produce a HOLE, and a
// hole must be impossible to mistake for a price.
// ============================================================================

const TIER = 'standard'

function req(over: Partial<Parameters<typeof requireRates>[1]> = {}) {
  return {
    kind: 'meal' as const,
    tier: TIER,
    table: 'meal_rates',
    lookupAttempted: 'meal_rates where is_active',
    message: 'Add lunch and dinner rates in Rates → Meals.',
    ...over,
  }
}

describe('requireRates — a usable lookup', () => {
  it('returns true and records nothing when rows came back', () => {
    const c = createHoleCollector()
    expect(requireRates(c, req({ rows: [{ lunch_rate_eur: 14 }] }))).toBe(true)
    expect(c.holes).toEqual([])
  })
})

describe('requireRates — an empty table is a data gap', () => {
  it('returns false and records the operator-facing message verbatim', () => {
    const c = createHoleCollector()
    expect(requireRates(c, req({ rows: [] }))).toBe(false)
    expect(c.holes).toHaveLength(1)
    expect(c.holes[0]).toMatchObject({
      kind: 'meal',
      tier: TIER,
      reason: 'missing',
      lookupAttempted: 'meal_rates where is_active',
      message: 'Add lunch and dinner rates in Rates → Meals.',
    })
  })

  it('treats null rows the same as an empty array', () => {
    const c = createHoleCollector()
    expect(requireRates(c, req({ rows: null }))).toBe(false)
    expect(c.holes).toHaveLength(1)
  })
})

describe('requireRates — a missing TABLE is not a data gap', () => {
  // airport_services and hotel_services do not exist. Telling an operator to
  // "add rates in Settings" for a table that was never created sends them
  // looking for a screen that cannot fix it.
  it('says the table is absent and that data entry will not help', () => {
    for (const code of ['PGRST205', '42P01']) {
      const c = createHoleCollector()
      const ok = requireRates(c, req({
        kind: 'airport_service',
        table: 'airport_services',
        error: { code, message: 'Could not find the table' },
      }))
      expect(ok, code).toBe(false)
      expect(c.holes[0].message, code).toContain('does not exist')
      expect(c.holes[0].message, code).toContain('not data entry')
    }
  })

  it('reports any other query error without claiming the table is missing', () => {
    const c = createHoleCollector()
    expect(requireRates(c, req({ error: { code: '42501', message: 'permission denied' } }))).toBe(false)
    expect(c.holes[0].message).toContain('42501')
    expect(c.holes[0].message).not.toContain('does not exist')
  })

  it('records the error even when rows are also present', () => {
    // A partial read must never be treated as a complete rate set.
    const c = createHoleCollector()
    expect(requireRates(c, req({ error: { code: '42501' }, rows: [{ lunch_rate_eur: 9 }] }))).toBe(false)
    expect(c.holes).toHaveLength(1)
  })
})

describe('deduplication', () => {
  it('collapses the same gap hit repeatedly into one', () => {
    // One missing table reached from twenty days is one thing to fix.
    const c = createHoleCollector()
    for (let i = 0; i < 20; i++) requireRates(c, req({ rows: [] }))
    expect(c.holes).toHaveLength(1)
  })

  it('keeps genuinely different gaps apart', () => {
    const c = createHoleCollector()
    requireRates(c, req({ rows: [] }))
    requireRates(c, req({ kind: 'guide', table: 'guides', lookupAttempted: 'guides where is_active', rows: [] }))
    expect(c.holes.map(h => h.kind)).toEqual(['meal', 'guide'])
  })

  it('separates the same kind on different days', () => {
    const c = createHoleCollector()
    c.addHole({ kind: 'entrance', tier: TIER, reason: 'missing', dayNumber: 1, lookupAttempted: 'x', message: 'a' })
    c.addHole({ kind: 'entrance', tier: TIER, reason: 'missing', dayNumber: 2, lookupAttempted: 'x', message: 'b' })
    expect(c.holes).toHaveLength(2)
  })
})

describe('operator-facing output', () => {
  it('describeHoles returns one message per gap, in order', () => {
    const c = createHoleCollector()
    requireRates(c, req({ rows: [], message: 'first' }))
    requireRates(c, req({ kind: 'guide', lookupAttempted: 'guides', rows: [], message: 'second' }))
    expect(describeHoles(c.holes)).toEqual(['first', 'second'])
  })

  it('the summary says the itinerary WAS created and that nothing is quoted', () => {
    const c = createHoleCollector()
    requireRates(c, req({ rows: [] }))
    const summary = unpricedSummary(c.holes)
    // The operator must not read this as "generation failed".
    expect(summary).toContain('Itinerary created')
    expect(summary).toContain('not priced')
    expect(summary).toContain('sent to a client')
  })

  it('pluralises a single gap correctly', () => {
    const c = createHoleCollector()
    requireRates(c, req({ rows: [] }))
    expect(unpricedSummary(c.holes)).toContain('1 rate gap ')
  })
})

describe('the contract the route depends on', () => {
  it('a hole never carries a number that could be mistaken for a rate', () => {
    const c = createHoleCollector()
    requireRates(c, req({ rows: [] }))
    requireRates(c, req({ kind: 'airport_service', table: 'airport_services', lookupAttempted: 'a', error: { code: 'PGRST205' } }))
    for (const h of c.holes) {
      expect(Object.values(h).every(v => typeof v !== 'number' || v === h.dayNumber)).toBe(true)
    }
  })

  it('holes.length is the whole gate — any gap at all blocks pricing', () => {
    const c = createHoleCollector()
    expect(c.holes.length > 0).toBe(false)
    requireRates(c, req({ rows: [] }))
    expect(c.holes.length > 0).toBe(true)
  })
})
