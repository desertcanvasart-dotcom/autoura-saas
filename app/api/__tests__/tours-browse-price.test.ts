import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// The tours page: THE LIST FIRST, THE PRICES AFTER.
//
//   GET /api/tours/browse          — the list. It does not price.
//   GET /api/tours/browse/prices   — the "starting from" figures, by tour id.
//
// History this file keeps pinned:
//   * a tour with no rates used to show `duration_days * 150`, a made-up
//     price — and the filter under it hid every tour whose price was null, so
//     the fabricated number was the only thing that could ever appear;
//   * the page asked a FLAG (`uses_day_builder`) before pricing a tour at all,
//     so 26 of 47 live tours were never sent to the engine (#484);
//   * the list route priced every tour before it answered — 5–8 seconds of
//     blank page on production data — and only ever returned the first 12.
// ============================================================================

const UUIDS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
let templates: Array<Record<string, unknown>> = []
let manualPrices: Array<{ price_per_person: number }> = []
let priceRange: { minPrice: number; tier: string } | null = null
const asked: string[] = []
let failFor: string | null = null
const calls: Array<{ table: string; method: string; args: unknown[] }> = []

function from(table: string) {
  const filters: Array<[string, unknown]> = []
  const q: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order', 'contains', 'gte', 'lte', 'or', 'range', 'limit']) {
    q[method] = (...args: unknown[]) => { calls.push({ table, method, args }); if (method === 'eq') filters.push([args[0] as string, args[1]]); return q }
  }
  q.in = (col: string, values: unknown[]) => { calls.push({ table, method: 'in', args: [col, values] }); filters.push([`in:${col}`, values]); return q }
  q.then = (resolve: (v: unknown) => unknown) => {
    if (table === 'variation_pricing') return resolve({ data: manualPrices, error: null })
    const idIn = filters.find(f => f[0] === 'in:id')?.[1] as string[] | undefined
    const rows = idIn ? templates.filter(t => idIn.includes(t.id as string)) : templates
    return resolve({ data: rows, error: null, count: rows.length })
  }
  return q
}

vi.mock('@/lib/supabase-server', () => ({ createAuthenticatedClient: async () => ({ from }) }))
vi.mock('@/lib/vocabulary-server', () => ({ loadVocabulary: async () => [] }))
vi.mock('@/lib/auto-pricing-service', () => ({
  getTemplatePriceRange: async (templateId: string) => { asked.push(templateId); if (templateId === failFor) throw new Error('engine fell over'); return priceRange },
}))

import { GET as browseRoute } from '@/app/api/tours/browse/route'
import { GET as pricesRoute } from '@/app/api/tours/browse/prices/route'

const browse = async (qs = '') => (await (await browseRoute(new Request(`http://x/api/tours/browse${qs}`) as never)).json())
const list = async (qs = '') => (await browse(qs)).data.templates as Array<Record<string, unknown>>
const prices = async (ids: string) => {
  const res = await pricesRoute(new Request(`http://x/api/tours/browse/prices?ids=${ids}`) as never)
  return { status: res.status, body: await res.json() }
}

const template = (over: Record<string, unknown> = {}) => ({
  id: UUIDS[0], tenant_id: 'tenant-a', template_name: 'Nile Week', template_code: 'NW',
  tour_type: 'classic', duration_days: 7, cities_covered: ['Luxor'], highlights: [],
  short_description: '', is_featured: false, image_url: null, uses_day_builder: false,
  pricing_mode: null, tour_theme: null, tour_variations: [], is_active: true,
  itinerary: [{ day: 1, title: 'Luxor', city: 'Luxor' }], ...over,
})

beforeEach(() => {
  templates = [template()]
  manualPrices = []
  priceRange = null
  asked.length = 0
  calls.length = 0
  failFor = null
})

describe('the list does not price', () => {
  it('never runs the engine — not even for a tour with days and a price to find', async () => {
    priceRange = { minPrice: 880, tier: 'deluxe' }
    const [tour] = await list()
    expect(asked).toEqual([])
    expect(tour).not.toHaveProperty('starting_from')
    expect(tour).not.toHaveProperty('starting_from_tier')
  })

  it('tells the page how many days each tour has — and keeps the days themselves on the server', async () => {
    templates = [template(), template({ id: UUIDS[1], itinerary: [] })]
    const tours = await list()
    expect(tours.map(t => t.day_count)).toEqual([1, 0])
    expect(tours[0]).not.toHaveProperty('itinerary')
    expect(tours[0]).not.toHaveProperty('uses_day_builder')
  })

  it('gives the card what it needs to link to the variation its price will describe', async () => {
    templates = [template({ tour_variations: [
      { id: 'v1', variation_code: 'NW-STD', tier: 'standard', is_active: true },
      { id: 'v2', variation_code: 'NW-DLX', tier: 'deluxe', is_active: true },
      { id: 'v3', variation_code: 'NW-OLD', tier: 'luxury', is_active: false },
    ] })]
    const [tour] = await list()
    expect(tour.default_variation_code).toBe('NW-STD')
    expect(tour.variation_code_by_tier).toEqual({ standard: 'NW-STD', deluxe: 'NW-DLX' })
  })

  it('lists as many as it is asked for — the page used to get only the first 12, ever', async () => {
    await browse('?limit=200')
    expect(calls.find(c => c.method === 'range')?.args).toEqual([0, 199])
    calls.length = 0
    await browse()
    expect(calls.find(c => c.method === 'range')?.args).toEqual([0, 11])
  })

  it('has a ceiling, and survives nonsense', async () => {
    await browse('?limit=100000')
    expect(calls.find(c => c.method === 'range')?.args).toEqual([0, 199])
    calls.length = 0
    await browse('?limit=banana')
    expect(calls.find(c => c.method === 'range')?.args).toEqual([0, 11])
  })
})

describe('the prices, asked for afterwards', () => {
  it('a tour the engine can price shows that price and its tier', async () => {
    priceRange = { minPrice: 880, tier: 'deluxe' }
    const { body } = await prices(UUIDS[0])
    expect(body.data.prices[UUIDS[0]]).toEqual({ starting_from: 880, starting_from_tier: 'deluxe' })
  })

  it('is priced with the flag OFF, as every imported tour has it (#484)', async () => {
    priceRange = { minPrice: 120, tier: 'standard' }
    await prices(UUIDS[0])
    expect(asked).toEqual([UUIDS[0]])
  })

  it('a tour with no price has NO price — never 7 x 150', async () => {
    templates = [template({ duration_days: 7 }), template({ id: UUIDS[1], duration_days: 3 })]
    const { body } = await prices(`${UUIDS[0]},${UUIDS[1]}`)
    const got = Object.values(body.data.prices).map((p: any) => p.starting_from)
    expect(got).toEqual([null, null])
    expect(got).not.toContain(1050)
    expect(got).not.toContain(450)
  })

  it.each([Infinity, NaN, 0, -5])('a nonsense price (%s) is no price', async bad => {
    priceRange = { minPrice: bad as number, tier: 'standard' }
    expect((await prices(UUIDS[0])).body.data.prices[UUIDS[0]]).toEqual({ starting_from: null, starting_from_tier: null })
  })

  it('a tour with NO days is not sent to the engine — there is nothing to price from', async () => {
    templates = [template({ itinerary: [] }), template({ id: UUIDS[1], itinerary: null })]
    priceRange = { minPrice: 120, tier: 'standard' }
    await prices(`${UUIDS[0]},${UUIDS[1]}`)
    expect(asked).toEqual([])
  })

  it('falls back to a manually entered variation price — active variations only', async () => {
    templates = [template({ itinerary: [], tour_variations: [{ id: 'v1', is_active: true }, { id: 'v2', is_active: false }] })]
    manualPrices = [{ price_per_person: 450 }]
    const { body } = await prices(UUIDS[0])
    expect(body.data.prices[UUIDS[0]]).toEqual({ starting_from: 450, starting_from_tier: null })
    expect(calls.find(c => c.table === 'variation_pricing' && c.method === 'in')?.args).toEqual(['variation_id', ['v1']])
  })

  it('one tour the engine chokes on is a card with no price — not a page with no prices', async () => {
    templates = [template({ id: UUIDS[1] }), template({ id: UUIDS[2] })]
    priceRange = { minPrice: 300, tier: 'standard' }
    failFor = UUIDS[2]
    const { status, body } = await prices(`${UUIDS[1]},${UUIDS[2]}`)
    expect(status).toBe(200)
    expect(body.data.prices[UUIDS[1]]).toEqual({ starting_from: 300, starting_from_tier: 'standard' })
    expect(body.data.prices[UUIDS[2]]).toEqual({ starting_from: null, starting_from_tier: null })
  })

  it('another agency\'s tour is simply not found, and not priced — the read goes through the caller\'s RLS', async () => {
    templates = [template()]                                  // RLS returns only this agency's
    priceRange = { minPrice: 880, tier: 'deluxe' }
    const { body } = await prices(`${UUIDS[0]},${UUIDS[2]}`)
    expect(Object.keys(body.data.prices)).toEqual([UUIDS[0]])
    expect(asked).toEqual([UUIDS[0]])
  })

  it('refuses nothing to price, too many, and anything that is not a tour id', async () => {
    expect((await prices('')).status).toBe(400)
    expect((await prices(Array.from({ length: 7 }, (_, i) => `${i}1111111-1111-4111-8111-111111111111`).join(','))).status).toBe(400)
    expect((await prices(`${UUIDS[0]},1 or 1=1`)).status).toBe(400)
    expect(asked).toEqual([])
  })
})

describe('nothing is left that pretends to switch pricing on', () => {
  const read = async (p: string) => (await import('node:fs')).readFileSync((await import('node:path')).join(process.cwd(), p), 'utf8')
  const code = (src: string) => src.replace(/^\s*\/\/.*$/gm, '')

  it('neither route reads the flag, and the list route does not import the engine', async () => {
    const listSrc = code(await read('app/api/tours/browse/route.ts'))
    expect(listSrc).not.toMatch(/uses_day_builder|pricing_mode/)
    expect(listSrc).not.toMatch(/auto-pricing-service|getTemplatePriceRange/)
    expect(code(await read('app/api/tours/browse/prices/route.ts'))).not.toMatch(/uses_day_builder|pricing_mode/)
  })

  it('Tour Manager no longer offers the "Auto-Pricing (Day Builder)" tick', async () => {
    expect(await read('app/tours/manage/TourManagerContent.tsx')).not.toMatch(/name="uses_day_builder"/)
  })

  it('the tours page asks for the whole list, then for prices in batches, and says which state a card is in', async () => {
    const src = await read('app/tours/tours-browser-page.tsx')
    expect(src).toContain('/api/tours/browse?limit=200&page=')
    expect(src).toContain('loadPricesInBatches(')
    expect(src).toContain('pricing…')
    expect(src).toContain('Price could not be loaded')
    expect(src).toContain('Price on request')
    expect(src).toContain('With a price')
    expect(src).toMatch(/tour\.day_count === 0 &&/)
    // It must not pull the engine into the browser bundle (the #479 lesson).
    expect(src).not.toMatch(/starting-from'|auto-pricing-service/)
  })
})
