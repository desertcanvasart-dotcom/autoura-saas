import { describe, it, expect } from 'vitest'
import { quoteCompleteness, allowsIncomplete, describeGaps } from '@/lib/pricing/quote-completeness'

// ============================================
// A saved quote knows whether it is fully priced
// ============================================
// Read from the quote's own saved lines: a service the engine could not price
// is kept at 0 with `unpriced: true` and the reason in `issue`. A stored flag
// would need its own migration and version handling, and could disagree with
// the lines — this cannot.

const priced = { service_name: 'Hotel - Nile Palace', day_number: 2, line_total: 120 }
const gap = { service_name: 'Guide', day_number: 3, unpriced: true, issue: 'No English guide rate. Add it in Rates → Guides.' }

describe('quoteCompleteness', () => {
  it('a fully priced quote is complete', () => {
    expect(quoteCompleteness([priced, priced])).toEqual({ complete: true, gaps: [] })
  })

  it('finds the unpriced lines, with their day and reason', () => {
    const result = quoteCompleteness([priced, gap])
    expect(result.complete).toBe(false)
    expect(result.gaps).toEqual([
      { name: 'Guide', day: 3, issue: 'No English guide rate. Add it in Rates → Guides.' },
    ])
  })

  it('reads the engine’s camelCase shape too', () => {
    const result = quoteCompleteness([{ serviceName: 'Cruise night', dayNumber: 5, unpriced: true, issue: 'No rate' }])
    expect(result.gaps[0]).toEqual({ name: 'Cruise night', day: 5, issue: 'No rate' })
  })

  it('treats a whole-trip line as having no day', () => {
    expect(quoteCompleteness([{ service_name: 'Water', unpriced: true, issue: 'x' }]).gaps[0].day).toBeNull()
  })

  it('an old quote with no such lines reads as complete — nothing is known about it', () => {
    for (const old of [null, undefined, [], 'not a list', {}]) {
      expect(quoteCompleteness(old).complete, String(old)).toBe(true)
    }
  })

  it('only an explicit unpriced flag counts', () => {
    expect(quoteCompleteness([{ service_name: 'x', unpriced: 'yes' }]).complete).toBe(true)
    expect(quoteCompleteness([{ service_name: 'x', unpriced: 1 }]).complete).toBe(true)
    expect(quoteCompleteness([{ service_name: 'x', line_total: 0 }]).complete).toBe(true)
  })
})

describe('allowsIncomplete', () => {
  it('accepts an unambiguous yes', () => {
    for (const yes of [true, 'true', '1', 1]) expect(allowsIncomplete(yes), String(yes)).toBe(true)
  })

  it('never waves a quote through on anything else', () => {
    for (const no of [undefined, null, false, '', 'false', '0', 'yes', 'TRUE', {}, []]) {
      expect(allowsIncomplete(no), JSON.stringify(no)).toBe(false)
    }
  })
})

describe('describeGaps', () => {
  it('names the services and their days', () => {
    expect(describeGaps([{ name: 'Guide', day: 3, issue: 'x' }, { name: 'Water', day: null, issue: 'y' }]))
      .toBe('Guide (day 3), Water')
  })

  it('counts the rest rather than listing everything', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ name: `S${i}`, day: i + 1, issue: 'x' }))
    expect(describeGaps(many)).toContain('and 3 more')
  })
})
