import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ============================================
// An incomplete quote does not leave by accident
// ============================================
// Every path that turns a saved quote into something a client or a supplier
// acts on — the quote PDF (both routes) and the conversion into a booking —
// must read the quote's own lines and refuse when services have no price,
// unless the caller explicitly allows it. A new path that skips this is the
// regression this test exists to catch.

const ROOT = path.join(__dirname, '..', '..', '..')
const GATED = [
  'app/api/quotes/[type]/[id]/pdf/route.ts',
  'app/api/quotes/b2b/[id]/generate-pdf/route.ts',
  'app/api/bookings/from-quote/route.ts',
]

describe('every quote-delivery path is gated', () => {
  for (const rel of GATED) {
    const src = readFileSync(path.join(ROOT, rel), 'utf8')

    it(`${rel} reads the quote's own lines`, () => {
      expect(src).toContain('quoteCompleteness(')
    })

    it(`${rel} refuses an incomplete quote with 422`, () => {
      expect(src).toMatch(/!completeness\.complete && !allowsIncomplete\(/)
      const gate = src.slice(src.indexOf('!completeness.complete'))
      expect(gate.slice(0, 800)).toMatch(/status: 422/)
    })

    it(`${rel} names what is missing`, () => {
      expect(src).toContain('describeGaps(completeness.gaps)')
      expect(src).toMatch(/gaps: completeness\.gaps/)
    })
  }
})

describe('the override is explicit', () => {
  it('the PDF routes take it from the query string, the booking from the body', () => {
    const pdf = readFileSync(path.join(ROOT, 'app/api/quotes/[type]/[id]/pdf/route.ts'), 'utf8')
    const b2bPdf = readFileSync(path.join(ROOT, 'app/api/quotes/b2b/[id]/generate-pdf/route.ts'), 'utf8')
    const booking = readFileSync(path.join(ROOT, 'app/api/bookings/from-quote/route.ts'), 'utf8')

    // The query string, however the route names its params object.
    expect(pdf).toMatch(/\.get\('allow_incomplete'\)/)
    expect(b2bPdf).toMatch(/\.get\('allow_incomplete'\)/)
    expect(booking).toContain('allowsIncomplete(body?.allow_incomplete)')
  })

  it('the quote page asks before it overrides', () => {
    const page = readFileSync(path.join(ROOT, 'app/quotes/b2b/[id]/page.tsx'), 'utf8')
    expect(page).toContain('allow_incomplete=true')
    expect(page, 'the operator is asked, not silently overridden').toMatch(/window\.confirm\(/)
  })
})
