import { describe, it, expect } from 'vitest'
import {
  createHoleCollector,
  requireRates,
  requireUsableRate,
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

// ============================================================================
// requireUsableRate — rows existing is NOT the same as a rate existing.
//
// The generator read daily_rate_eur, capacity_min, capacity_max,
// lunch_rate_eur and dinner_rate_eur. None exist: the columns are daily_rate,
// passenger_capacity, and meal_type + base_rate_eur. With rows present and the
// column absent, toNumber(undefined, 0) produced 0 and requireRates saw rows,
// so NO hole fired — seeding the tables would have turned honest unpriced
// drafts into confident €0 quotes.
// ============================================================================
describe('requireUsableRate', () => {
  const spec = {
    kind: 'transport' as const,
    tier: TIER,
    table: 'vehicles',
    lookupAttempted: 'daily_rate for vehicle X',
    message: 'The selected vehicle has no daily rate.',
  }

  it('returns a positive rate and records nothing', () => {
    const c = createHoleCollector()
    expect(requireUsableRate(c, 80, spec)).toBe(80)
    expect(c.holes).toEqual([])
  })

  it('accepts a numeric string — DECIMAL columns arrive as strings', () => {
    const c = createHoleCollector()
    expect(requireUsableRate(c, '80.50', spec)).toBe(80.5)
    expect(c.holes).toEqual([])
  })

  it('records a hole for undefined — the wrong-column-name case', () => {
    const c = createHoleCollector()
    const row: Record<string, unknown> = { daily_rate: 80 }
    expect(requireUsableRate(c, row.daily_rate_eur, spec)).toBeNull()
    expect(c.holes).toHaveLength(1)
    expect(c.holes[0].message).toBe(spec.message)
  })

  it('rejects zero — a supplier rate of nothing is bad data, not a free service', () => {
    const c = createHoleCollector()
    expect(requireUsableRate(c, 0, spec)).toBeNull()
    expect(c.holes).toHaveLength(1)
  })

  it('rejects negative, null, NaN and non-numeric text', () => {
    for (const bad of [-5, null, undefined, NaN, 'abc', {}, []]) {
      const c = createHoleCollector()
      expect(requireUsableRate(c, bad, spec), String(bad)).toBeNull()
      expect(c.holes, String(bad)).toHaveLength(1)
    }
  })

  it('dedups with requireRates holes on the same key', () => {
    const c = createHoleCollector()
    requireUsableRate(c, undefined, spec)
    requireUsableRate(c, undefined, spec)
    expect(c.holes).toHaveLength(1)
  })

  it('REGRESSION: a populated table with the wrong column still blocks pricing', () => {
    // Rows exist, so requireRates passes — this is exactly the gap that made
    // seeding dangerous. requireUsableRate must catch it.
    const c = createHoleCollector()
    const rows = [{ daily_rate: 80, passenger_capacity: 7 }]
    expect(requireRates(c, { kind: 'transport', tier: TIER, table: 'vehicles',
      lookupAttempted: 'vehicles where is_active', message: 'none set up', rows })).toBe(true)
    expect(c.holes).toHaveLength(0)

    expect(requireUsableRate(c, (rows[0] as Record<string, unknown>).daily_rate_eur, spec)).toBeNull()
    expect(c.holes).toHaveLength(1)
  })
})
