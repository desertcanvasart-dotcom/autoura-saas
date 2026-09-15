import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// ============================================================================
// A tour imported from CSV has its day-by-day narrative in long_description and
// an EMPTY structured itinerary — the CSV cannot carry a nested structure. The
// engine counted hotelNights from the itinerary's days and never from
// duration_nights, so a 3-night package priced with ZERO accommodation and
// still returned a number, behind a warning nobody surfaces.
//
// The harness rule: a price is deliverable only when complete, and complete
// means holes.length === 0. A missing day structure is a hole.
// ============================================================================

const src = fs.readFileSync(
  path.join(process.cwd(), 'lib/auto-pricing-service.ts'),
  'utf8'
)

const codeOnly = src
  .split('\n')
  .filter((l) => {
    const t = l.trim()
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
  })
  .join('\n')

describe('an empty itinerary cannot produce a deliverable price', () => {
  it('records a hole rather than only a warning', () => {
    const i = codeOnly.indexOf('if (itinerary.length === 0)')
    expect(i, 'the empty-itinerary branch').toBeGreaterThan(-1)
    const branch = codeOnly.slice(i, i + 700)
    expect(branch).toContain('addHole(')
  })

  it('uses the template kind — the gap is before any rate lookup', () => {
    const i = codeOnly.indexOf('if (itinerary.length === 0)')
    const branch = codeOnly.slice(i, i + 700)
    expect(branch).toContain("kind: 'template'")
    expect(branch).toContain("reason: 'missing'")
  })

  it('tells the operator both ways out', () => {
    // Add the days, or price through variations instead of the day builder.
    const i = src.indexOf("kind: 'template'")
    const hole = src.slice(i, i + 700)
    expect(hole).toMatch(/Day-by-Day/)
    expect(hole).toMatch(/variations/)
  })

  it('completeness is still holes-driven, so the hole is enough', () => {
    // No separate refusal path to keep in sync: every consumer that already
    // respects `complete` now refuses this too.
    expect(codeOnly).toContain('complete: holes.length === 0')
  })
})

describe('the form says which field is which', () => {
  const form = fs.readFileSync(
    path.join(process.cwd(), 'app/tours/manage/TourManagerContent.tsx'),
    'utf8'
  )

  it('warns that prose in Long Description is not the itinerary', () => {
    expect(form).toContain('does not build the itinerary')
  })

  it('says the structured days are what Auto-Pricing reads', () => {
    expect(form).toContain('Auto-Pricing needs these days')
  })

  it('points each field at the other, since they read alike', () => {
    expect(form).toContain('Details → Day-by-Day Itinerary')
    expect(form).toContain('the Long Description, on the Basic tab')
  })
})
