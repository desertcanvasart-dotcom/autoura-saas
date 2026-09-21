import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// GET /api/tours/browse — the "Starting from" price on a tour card.
//
// A tour with no rates behind it fell through to `duration_days * 150`,
// labelled tier "standard": a made-up per-person price, shown to whoever
// browses. The filter under it then dropped every tour whose price was null —
// so the fabricated number was the only thing that could ever appear.
//
// A tour with no price is now listed with no price.
// ============================================================================

let templates: Array<Record<string, unknown>> = []
let priceRange: { minPrice: number; tier: string } | null = null

const query: Record<string, unknown> = {}
for (const method of ['select', 'eq', 'order', 'contains', 'gte', 'lte', 'or', 'range', 'in', 'limit']) {
  query[method] = () => query
}
;(query as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
  resolve({ data: templates, error: null, count: templates.length })

vi.mock('@/lib/supabase-server', () => ({
  createAuthenticatedClient: async () => ({ from: () => query }),
}))
vi.mock('@/lib/vocabulary-server', () => ({ loadVocabulary: async () => [] }))
const asked: string[] = []
vi.mock('@/lib/auto-pricing-service', () => ({
  getTemplatePriceRange: async (templateId: string) => { asked.push(templateId); return priceRange },
}))

import { GET } from '@/app/api/tours/browse/route'

async function browse() {
  const res = await GET(new Request('http://x/api/tours/browse') as never)
  return (await res.json()).data.templates as Array<Record<string, unknown>>
}

const template = (over: Record<string, unknown> = {}) => ({
  id: 't1', tenant_id: 'tenant-a', template_name: 'Nile Week', template_code: 'NW',
  tour_type: 'classic', duration_days: 7, cities_covered: ['Luxor'], highlights: [],
  short_description: '', is_featured: false, image_url: null, uses_day_builder: true,
  pricing_mode: 'auto', tour_theme: null, tour_variations: [],
  itinerary: [{ day: 1, title: 'Luxor', city: 'Luxor' }], ...over,
})

beforeEach(() => {
  templates = [template()]
  priceRange = null
  asked.length = 0
})

describe('a tour the engine can price', () => {
  it('shows that price and its tier', async () => {
    priceRange = { minPrice: 880, tier: 'deluxe' }
    const [tour] = await browse()
    expect(tour.starting_from).toBe(880)
    expect(tour.starting_from_tier).toBe('deluxe')
  })
})

describe('a tour with no price', () => {
  it('is still listed, with no price — not 7 x 150', async () => {
    const [tour] = await browse()
    expect(tour).toBeDefined()
    expect(tour.starting_from).toBeNull()
    expect(tour.starting_from_tier).toBeNull()
  })

  it('never reports the old fabricated figure', async () => {
    templates = [template({ duration_days: 7 }), template({ id: 't2', duration_days: 3 })]
    const prices = (await browse()).map(t => t.starting_from)
    expect(prices).toEqual([null, null])
    expect(prices).not.toContain(1050)
    expect(prices).not.toContain(450)
  })
})

describe('a nonsense price', () => {
  it('is blanked, and the tour is still listed', async () => {
    priceRange = { minPrice: Infinity, tier: 'standard' }
    const [tour] = await browse()
    expect(tour).toBeDefined()
    expect(tour.starting_from).toBeNull()
  })
})

// ============================================================================
// Every tour with days is priced (operator, 2026-09-21).
//
// The page used to ask a FLAG first — `uses_day_builder`, a column that
// defaults to false and that a CSV import leaves false. 26 of 47 live tours
// (all of Sawa Tours', Sillage's and the Sandbox's) were never sent to the
// engine at all, whatever their days said; 25 of them had a full programme.
// ============================================================================
describe('what decides whether a tour is priced', () => {
  it('a tour with days is priced — with the flag OFF, as every imported tour has it', async () => {
    templates = [template({ uses_day_builder: false, pricing_mode: null })]
    priceRange = { minPrice: 120, tier: 'standard' }
    const [tour] = await browse()
    expect(asked).toEqual(['t1'])
    expect(tour.starting_from).toBe(120)
  })

  it('a tour with NO days is not sent to the engine — there is nothing to price from — and is still listed', async () => {
    templates = [template({ itinerary: [] }), template({ id: 't2', itinerary: null })]
    priceRange = { minPrice: 120, tier: 'standard' }
    const tours = await browse()
    expect(asked).toEqual([])
    expect(tours.map(t => t.starting_from)).toEqual([null, null])
  })

  it('the flag ON changes nothing for a tour with no days', async () => {
    templates = [template({ itinerary: [], uses_day_builder: true, pricing_mode: 'auto' })]
    await browse()
    expect(asked).toEqual([])
  })

  it('tells the page how many days each tour has, and no longer sends the flag', async () => {
    templates = [template(), template({ id: 't2', itinerary: [] })]
    const tours = await browse()
    expect(tours.map(t => t.day_count)).toEqual([1, 0])
    expect(tours[0]).not.toHaveProperty('uses_day_builder')
    expect(tours[0]).not.toHaveProperty('pricing_mode')
    // The days themselves stay on the server: they are prose, and large.
    expect(tours[0]).not.toHaveProperty('itinerary')
  })
})

describe('nothing is left that pretends to switch pricing on', () => {
  const read = async (p: string) => (await import('node:fs')).readFileSync((await import('node:path')).join(process.cwd(), p), 'utf8')

  it('the browse route does not read the flag', async () => {
    const src = (await read('app/api/tours/browse/route.ts')).replace(/^\s*\/\/.*$/gm, '')
    expect(src).not.toMatch(/uses_day_builder|pricing_mode/)
  })

  it('Tour Manager no longer offers the "Auto-Pricing (Day Builder)" tick', async () => {
    const src = await read('app/tours/manage/TourManagerContent.tsx')
    expect(src).not.toMatch(/name="uses_day_builder"/)
  })

  it('the tours page counts tours WITH A PRICE, and flags the ones with no days', async () => {
    const src = await read('app/tours/tours-browser-page.tsx')
    expect(src).toContain('With a price')
    expect(src).not.toContain('With Auto-Pricing')
    expect(src).toMatch(/tour\.day_count === 0 &&/)
  })
})
