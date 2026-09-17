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
vi.mock('@/lib/auto-pricing-service', () => ({
  getTemplatePriceRange: async () => priceRange,
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
  pricing_mode: 'auto', tour_theme: null, tour_variations: [], ...over,
})

beforeEach(() => {
  templates = [template()]
  priceRange = null
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
