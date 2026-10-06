import { describe, it, expect } from 'vitest'
// @ts-expect-error — a plain .mjs script, no type declarations
import { planQuoteTables, GRID_SAVE_NOTE } from '../cleanup-b2b-pricing-table-shape.mjs'

// ============================================================================
// The one-time re-key of B2B pricing tables the grid stored as a list
// (scripts/cleanup-b2b-pricing-table-shape.mjs). Its plan is pure: which
// tables are re-keyed (numbers unchanged), which are left for a person, and
// which itineraries carry a duplicate quote from the grid's save.
// ============================================================================

const q = (id: string, pricing_table: unknown, extra: Record<string, unknown> = {}) =>
  ({ id, quote_number: `B2B-${id}`, itinerary_id: null, internal_notes: null, pricing_table, updated_at: 't', ...extra })

describe('planQuoteTables', () => {
  it('re-keys the grid save’s row and quote-from-itinerary’s row, numbers unchanged', () => {
    const plan = planQuoteTables([
      q('save', [{ pax: 2, cost_per_person: 300, selling_per_person: 375, total: 750 }]),
      q('qfi', [{ pax: 4, cost_per_person: 200, selling_per_person: 250.5, total: 1002 }]),
    ])
    expect(plan.convert.map((c: { id: string; table: unknown }) => [c.id, c.table])).toEqual([
      ['save', { '2': { pp: 375, total: 750 } }],
      ['qfi', { '4': { pp: 250.5, total: 1002 } }],
    ])
    expect(plan.unreadable).toEqual([])
  })

  it('a row with no per-person price takes total ÷ pax; other key spellings read too', () => {
    const plan = planQuoteTables([q('a', [{ numPax: 3, sellingPrice: 1000 }])])
    expect(plan.convert[0].table).toEqual({ '3': { pp: 333.33, total: 1000 } })
  })

  it('leaves keyed, empty and missing tables alone', () => {
    const plan = planQuoteTables([
      q('keyed', { '2': { pp: 1, total: 2 } }),
      q('empty', []),
      q('none', null),
    ])
    expect(plan.convert).toEqual([])
    expect(plan.unreadable).toEqual([])
  })

  it('a table it cannot fully read is listed, never half-converted', () => {
    const plan = planQuoteTables([
      q('no-total', [{ pax: 2, total: 500 }, { pax: 4 }]),
      q('no-pax', [{ total: 500 }]),
      q('fraction', [{ pax: 2.5, total: 500 }]),
      q('twice', [{ pax: 2, total: 500 }, { pax: 2, total: 600 }]),
      q('junk', ['x']),
    ])
    expect(plan.convert).toEqual([])
    expect(plan.unreadable.map((u: { id: string; reason: string }) => [u.id, u.reason])).toEqual([
      ['no-total', 'the 4-pax row has no total'],
      ['no-pax', 'a row with no whole group size'],
      ['fraction', 'a row with no whole group size'],
      ['twice', 'two rows for 2 pax'],
      ['junk', 'a row that is not an object'],
    ])
  })

  it('lists the grid save’s quote beside another for the same itinerary; changes neither', () => {
    const plan = planQuoteTables([
      q('1', [{ pax: 2, total: 750 }], { itinerary_id: 'it1', internal_notes: GRID_SAVE_NOTE }),
      q('2', [{ pax: 2, total: 760 }], { itinerary_id: 'it1', internal_notes: 'Created from itinerary ITN-1' }),
      q('3', [{ pax: 2, total: 700 }], { itinerary_id: 'it2', internal_notes: GRID_SAVE_NOTE }),
    ])
    expect(plan.duplicates).toEqual([{ itinerary_id: 'it1', gridSave: ['B2B-1'], others: ['B2B-2'] }])
    expect(plan.convert).toHaveLength(3)
  })
})
