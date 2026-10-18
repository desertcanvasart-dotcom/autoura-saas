import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { isQuoteStatus, quoteStatusError } from '@/lib/quotes/quote-status'

const ROOT = path.join(__dirname, '..', '..')
const src = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')

// Sell-group bugs, 2026-10-11.
describe('B2B quotes are not duplicated', () => {
  it('"Update B2B Quote" reprices the itinerary’s open quote', () => {
    const r = src('app/api/b2b/quote-from-itinerary/route.ts')
    expect(r).toContain(".in('status', ['draft', 'sent'])")
    expect(r).toContain(".update({ ...priced, updated_at: new Date().toISOString() })")
    expect(r).toContain("action: open ? 'updated' : 'created'")
  })

  it('one template per itinerary, under its own code', () => {
    const r = src('app/api/b2b/create-template-from-itinerary/route.ts')
    expect(r).toContain('const templateCode = `TPL-${itinerary.itinerary_code}`.slice(0, 50)')
    expect(r).not.toContain('Math.random()')
    expect(r).toContain('existingTemplate')
    expect(r).toContain('existingVariation')
  })

  it('the calculator opened from the Quote Builder updates that quote', () => {
    expect(src('app/pricing-grid/page.tsx')).toContain("?quote=${quoteId}")
    const page = src('app/b2b/calculator/[id]/page.tsx')
    expect(page).toContain("...(linkedQuoteId ? { quote_id: linkedQuoteId } : {}),")
    expect(page).toContain("{linkedQuote ? 'Update Quote' : 'Save as Quote'}")
    const route = src('app/api/b2b/quotes/route.ts')
    expect(route).toContain(".in('status', ['draft', 'sent'])")
    expect(route).toContain("action: target ? 'updated' : 'created'")
  })
})

describe('B2B quote saving and conversion', () => {
  it('a price with holes is saved only when the operator says so', () => {
    expect(src('app/api/b2b/quotes/route.ts')).toContain('if (result.complete === false && body.allow_incomplete !== true) {')
    expect(src('app/b2b/calculator/[id]/page.tsx')).toContain('if (data.incomplete && !allowIncomplete) {')
  })

  it('the save dialog shows what was priced, not the form', () => {
    const page = src('app/b2b/calculator/[id]/page.tsx')
    expect(page).toContain("{result?.num_pax} {result?.tour_leader_included ? '(+1 TL)' : ''}")
    expect(page).toContain('{result?.travel_date}')
  })

  it('the tour-leader group line shows (num_pax is the paying guests)', () => {
    expect(src('app/b2b/calculator/[id]/page.tsx')).toContain('{result.num_pax + 1} total ({result.num_pax} paying guests + 1 tour leader)')
  })

  it('converting asks before booking a quote with unpriced services, and links the booking once made', () => {
    const btn = src('components/quotes/ConvertToBookingButton.tsx')
    expect(btn).toContain('allow_incomplete: true')
    expect(btn).toContain(".eq('quote_id', quoteId)")
    expect(btn).toContain('View booking')
    for (const t of ['b2b', 'b2c']) {
      expect(src(`app/quotes/${t}/[id]/page.tsx`)).toContain(`<ConvertToBookingButton quoteId={quote.id} quoteType="${t}"`)
    }
  })

  it('the PDF download checks completeness too', () => {
    const r = src('app/api/quotes/b2b/[id]/generate-pdf/route.ts')
    const get = r.slice(r.indexOf('export async function GET'))
    expect(get).toContain("allowsIncomplete(new URL(request.url).searchParams.get('allow_incomplete'))")
  })

  it('the client and notes from the calculator are shown', () => {
    expect(src('app/quotes/b2b/[id]/page.tsx')).toContain('Client &amp; Notes')
  })

  it('the unused, naively priced route is gone', () => {
    expect(existsSync(path.join(ROOT, 'app/api/quotes/b2b/from-itinerary/route.ts'))).toBe(false)
  })
})

describe('margins', () => {
  it('a partner’s 0% is a margin everywhere', () => {
    expect(src('app/pricing-grid/components/GridHeader.tsx')).toContain('partner.default_margin_percent ?? DEFAULT_MARGINS.b2b')
    const pv = src('lib/b2b/price-variation.ts')
    expect(pv).toContain('default_margin_percent != null')
    expect(pv).toContain('margin_percent_override != null')
  })

  it('the margin the operator priced with is kept', () => {
    expect(src('app/api/b2b/quote-from-itinerary/route.ts')).toContain('let effectiveMargin = Number.isFinite(sentMargin) ? sentMargin : 25')
  })

  it('no negative margin from the Quote Builder', () => {
    expect(src('app/pricing-grid/components/GridHeader.tsx')).toContain('Math.min(Math.max(parseFloat(e.target.value) || 0, 0), 100)')
  })
})

describe('quote statuses', () => {
  it('only real statuses are stored', () => {
    expect(isQuoteStatus('b2c', 'viewed')).toBe(true)
    expect(isQuoteStatus('b2b', 'viewed')).toBe(false)
    expect(isQuoteStatus('b2b', 'Acepted')).toBe(false)
    expect(isQuoteStatus('b2c', null)).toBe(false)
    expect(quoteStatusError('b2b')).toContain('draft, sent, accepted, rejected, expired')
    for (const f of ['app/api/quotes/b2c/bulk-update/route.ts', 'app/api/quotes/b2b/bulk-update/route.ts', 'app/api/quotes/b2c/[id]/route.ts', 'app/api/quotes/b2b/[id]/route.ts', 'app/api/b2b/quotes/route.ts']) {
      expect(src(f)).toContain('isQuoteStatus(')
    }
  })
})

describe('the quote lists', () => {
  for (const t of ['b2b', 'b2c']) {
    it(`${t}: select-all is the page you see; CSV cells are escaped`, () => {
      const page = src(`app/quotes/${t}/page.tsx`)
      expect(page).toContain('checked={pageAllSelected}')
      expect(page).toContain('row.map(csvCell)')
    })
  }

  it('quote edit: the agency’s tiers, and no currency relabel', () => {
    for (const t of ['b2b', 'b2c']) {
      const page = src(`app/quotes/${t}/[id]/edit/page.tsx`)
      expect(page).toContain('<VocabSelect kind="tier"')
      expect(page).not.toContain('onChange={(e) => setCurrency(e.target.value)}')
    }
  })
})

describe('programmes that list their own services', () => {
  it('meals at the variation’s tier; tour leader flagged; the rate sheet priced size by size', () => {
    const pv = src('lib/b2b/price-variation.ts')
    expect(pv).toContain(".eq('tier', effectiveTier)")
    expect(pv).toContain('so the tour leader is not priced')
    expect(src('app/b2b/calculator/[id]/page.tsx')).toContain('const sizes = Array.from({ length: 10 }, (_, i) => i + 1)')
  })

  it('templates see the grid’s airport and hotel services', () => {
    const r = src('app/api/b2b/create-template-from-itinerary/route.ts')
    expect(r).toContain("isSlot(s, 'airport_services', 'airport_service', 'airport_services')")
    expect(r).toContain('itinerary_day_id')
  })
})
