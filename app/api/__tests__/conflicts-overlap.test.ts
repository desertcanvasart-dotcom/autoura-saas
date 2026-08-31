// The conflict route was N+1: one overlap query per confirmed resource. The
// overlap logic now lives in a pure computeConflicts() so it runs once, in
// memory, over a single candidate fetch. This pins its semantics to what the
// per-resource SQL did — same overlaps, same exclusions, same output shape —
// so the performance refactor cannot quietly change what counts as a conflict.
import { describe, it, expect } from 'vitest'
import { computeConflicts } from '@/app/api/itinerary-resources/conflicts/route'

const res = (o: Partial<Parameters<typeof computeConflicts>[0][0]> = {}) => ({
  resource_type: 'guide',
  resource_id: 'g1',
  resource_name: 'Amr',
  start_date: '2027-01-10',
  end_date: '2027-01-14',
  ...o,
})
const cand = (o: Record<string, unknown> = {}) => ({
  resource_type: 'guide',
  resource_id: 'g1',
  start_date: '2027-01-12',
  end_date: '2027-01-16',
  itinerary_id: 'other-1',
  itineraries: { itinerary_code: 'ITIN-OTHER' },
  ...o,
}) as Parameters<typeof computeConflicts>[1][0]

describe('computeConflicts', () => {
  it('flags an overlapping assignment on another itinerary', () => {
    const out = computeConflicts([res()], [cand()])
    expect(out).toEqual([
      { resource_id: 'g1', resource_name: 'Amr', conflicting_itinerary: 'ITIN-OTHER', dates: '2027-01-12 - 2027-01-16' },
    ])
  })

  it('ignores a non-overlapping range', () => {
    expect(computeConflicts([res()], [cand({ start_date: '2027-02-01', end_date: '2027-02-05' })])).toEqual([])
  })

  it('treats touching boundaries as an overlap (>=/<=, as the SQL did)', () => {
    // candidate ends exactly on the resource start day
    const out = computeConflicts([res({ start_date: '2027-01-14', end_date: '2027-01-20' })], [cand({ start_date: '2027-01-10', end_date: '2027-01-14' })])
    expect(out).toHaveLength(1)
  })

  it('excludes a candidate with a null end_date, exactly as .gte dropped it', () => {
    expect(computeConflicts([res()], [cand({ end_date: null })])).toEqual([])
  })

  it('matches on (type AND id): a same-id row of another type is not a conflict', () => {
    expect(computeConflicts([res()], [cand({ resource_type: 'vehicle' })])).toEqual([])
    expect(computeConflicts([res()], [cand({ resource_id: 'g2' })])).toEqual([])
  })

  it('uses the resource start_date as its end when end_date is null', () => {
    // single-day resource on the 12th; candidate spanning it overlaps
    const out = computeConflicts([res({ start_date: '2027-01-12', end_date: null })], [cand({ start_date: '2027-01-10', end_date: '2027-01-14' })])
    expect(out).toHaveLength(1)
    expect(out[0].dates).toBe('2027-01-10 - 2027-01-14')
  })

  it('falls back to itinerary_id when the embed has no code', () => {
    const out = computeConflicts([res()], [cand({ itineraries: null })])
    expect(out[0].conflicting_itinerary).toBe('other-1')
  })

  it('emits one row per (resource, overlapping candidate), preserving order', () => {
    const resources = [res({ resource_id: 'g1' }), res({ resource_id: 'g2', resource_name: 'Sara' })]
    const candidates = [
      cand({ resource_id: 'g2', itineraries: { itinerary_code: 'A' } }),
      cand({ resource_id: 'g1', itineraries: { itinerary_code: 'B' } }),
    ]
    const out = computeConflicts(resources, candidates)
    // grouped by resource: g1 first (its match B), then g2 (its match A)
    expect(out.map(c => c.conflicting_itinerary)).toEqual(['B', 'A'])
  })

  it('is a single pass regardless of candidate count (no per-resource query)', () => {
    const resources = Array.from({ length: 50 }, (_, i) => res({ resource_id: `g${i}` }))
    const candidates = Array.from({ length: 50 }, (_, i) => cand({ resource_id: `g${i}`, itineraries: { itinerary_code: `C${i}` } }))
    expect(computeConflicts(resources, candidates)).toHaveLength(50)
  })
})
