import { describe, it, expect } from 'vitest'
// @ts-expect-error — a plain .mjs script, no type declarations
import { planOvernightFixes } from '../cleanup-overnight-city.mjs'

// ============================================================================
// The one-time correction of nights saved at the day's city instead of the
// booked hotel's (scripts/cleanup-overnight-city.mjs). It changes a day only
// when a hotel pinned to Rates proves where the night is.
// ============================================================================

const MENA = 'h-mena'
const lines = (pairs: Array<[string, string]>) => pairs.map(([itinerary_day_id, rate_id]) => ({ itinerary_day_id, rate_id }))
const day = (id: string, day_number: number, overnight_city: string | null) => ({ id, itinerary_id: 'it1', day_number, overnight_city })

describe('planOvernightFixes', () => {
  it('ITN-S-2026-8987: the Alexandria day trip’s night moves to the hotel’s Cairo; matching nights stay', () => {
    const fixes = planOvernightFixes({
      lines: lines([['d1', MENA], ['d2', MENA], ['d3', MENA]]),
      days: [day('d3', 3, 'Alexandria'), day('d1', 1, 'Cairo'), day('d2', 2, ' cairo ')],
      hotels: [{ id: MENA, city: 'Cairo' }],
    })
    expect(fixes).toEqual([{ id: 'd3', itinerary_id: 'it1', day_number: 3, from: 'Alexandria', to: 'Cairo' }])
  })

  it('an empty night takes the hotel’s city', () => {
    const fixes = planOvernightFixes({ lines: lines([['d1', MENA]]), days: [day('d1', 1, null)], hotels: [{ id: MENA, city: 'Cairo' }] })
    expect(fixes.map((f: { to: string }) => f.to)).toEqual(['Cairo'])
  })

  it('leaves alone: a cruise night, a hotel with no city, a hotel no longer in Rates', () => {
    const fixes = planOvernightFixes({
      lines: lines([['d1', MENA], ['d2', 'h-nocity'], ['d3', 'h-gone']]),
      days: [day('d1', 1, 'On board Sonesta'), day('d2', 2, 'Luxor'), day('d3', 3, 'Aswan')],
      hotels: [{ id: MENA, city: 'Cairo' }, { id: 'h-nocity', city: '  ' }],
    })
    expect(fixes).toEqual([])
  })

  it('a day with two hotel lines uses the first with a city', () => {
    const fixes = planOvernightFixes({
      lines: lines([['d1', 'h-gone'], ['d1', MENA], ['d1', 'h-luxor']]),
      days: [day('d1', 1, 'Giza')],
      hotels: [{ id: MENA, city: 'Cairo' }, { id: 'h-luxor', city: 'Luxor' }],
    })
    expect(fixes.map((f: { to: string }) => f.to)).toEqual(['Cairo'])
  })
})
