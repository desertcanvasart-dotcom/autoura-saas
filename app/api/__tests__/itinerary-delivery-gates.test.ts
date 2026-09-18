import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ============================================
// An incomplete itinerary does not reach a client
// ============================================
// Every path that puts an itinerary in front of a CLIENT — the email with the
// PDF, the WhatsApp quote, and the share link — reads the itinerary's own
// service rows and refuses when a service has no price, unless the operator
// explicitly allows it. A new client-facing path that skips this is the
// regression this test exists to catch.
//
// Supplier documents are deliberately NOT gated: a voucher goes to a supplier
// who is being asked to provide the service, not to the traveller who is being
// asked to pay for it.

const ROOT = path.join(__dirname, '..', '..', '..')
const GATED = [
  'app/api/send-email/route.ts',
  'app/api/whatsapp/send-quote/route.ts',
  'app/api/itineraries/[id]/share/route.ts',
]

describe('every client-facing itinerary path is gated', () => {
  for (const rel of GATED) {
    const src = readFileSync(path.join(ROOT, rel), 'utf8')

    it(`${rel} reads the itinerary's own rows from the database`, () => {
      expect(src).toContain('loadItineraryCompleteness(')
    })

    it(`${rel} fails closed when the rows cannot be read`, () => {
      // The loader answers {ok:false,status} — the route must return it, not
      // fall through to the amount-only check.
      expect(src).toMatch(/if \(!itineraryLines\.ok\)/)
      expect(src).toMatch(/status: itineraryLines\.status/)
    })

    it(`${rel} refuses an incomplete itinerary with 422, naming the services`, () => {
      expect(src).toMatch(/!itineraryLines\.completeness\.complete && !allowsIncomplete\(/)
      expect(src).toContain('describeGaps(itineraryLines.completeness.gaps)')
      const gate = src.slice(src.indexOf('!itineraryLines.completeness.complete'))
      expect(gate.slice(0, 800)).toMatch(/status: 422/)
    })
  }
})

describe('supplier documents stay ungated, on purpose', () => {
  it('generate-documents does not gate on traveller-facing completeness', () => {
    const src = readFileSync(path.join(ROOT, 'app/api/itineraries/[id]/generate-documents/route.ts'), 'utf8')
    expect(src).not.toContain('loadItineraryCompleteness(')
  })
})

// ============================================
// The share link records what was approved, and the page re-checks
// ============================================
describe('the share link and its public page', () => {
  const route = readFileSync(path.join(ROOT, 'app/api/itineraries/[id]/share/route.ts'), 'utf8')
  const page = readFileSync(path.join(ROOT, 'app/share/[token]/page.tsx'), 'utf8')

  it('records the approved gaps, when, and by whom', () => {
    expect(route).toContain('toApprovedGaps(itineraryLines.completeness.gaps)')
    expect(route).toContain('incomplete_approved_at')
    expect(route).toContain('incomplete_approved_by')
  })

  it('updates the record when an existing link is shared again', () => {
    expect(route).toMatch(/if \(token && approval\)/)
  })

  it('records nothing when the itinerary is complete', () => {
    expect(route).toContain('itineraryLines.completeness.complete')
    expect(route).toContain('? null')
  })

  it('the public page decides on EVERY view, not only at creation', () => {
    expect(page).toContain('loadItineraryCompleteness(')
    expect(page).toContain('sharePriceDecision(')
    expect(page).toContain('incomplete_approved_gaps')
  })

  it('a withheld price never reaches the traveller-facing projection', () => {
    expect(page).toMatch(/priceDecision\.show \? itinerary : \{ \.\.\.itinerary, total_cost: null \}/)
  })
})
