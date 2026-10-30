import { describe, it, expect, vi, beforeEach } from 'vitest'
import { assembleTourFacts, type FactsInput, type TierResults } from '@/lib/publish/tour-facts'
import { tourFactsSchema } from '@/lib/publish/contract'

// ============================================================================
// A tour's facts for its Publish page (docs/publish/PLAN.md §8, step 5).
// Every figure from the records. The price is the tour's ONE public rate —
// the bands a manager approved (lib/publish/public-rate.ts) — never the
// engine's live answer and never a nationality figure (brief 2026-10-28).
// ============================================================================

const TODAY = new Date('2026-10-25T10:00:00Z')

type R = { complete: boolean; pp: number; table?: Record<number, number>; services?: unknown[] }
function results(tiers: Record<string, R>): TierResults {
  return new Map(Object.entries(tiers).map(([tier, r]) => [tier, {
    success: true, complete: r.complete, pricePerPerson: r.pp,
    paxPricingTable: Object.entries(r.table ?? { 2: r.pp }).map(([pax, pp]) => ({ numPax: Number(pax), withoutLeader: { pricePerPerson: pp } })),
    services: r.services ?? [],
  }])) as unknown as TierResults
}

function input(over: Partial<FactsInput> = {}): FactsInput {
  return {
    language: 'en',
    template: {
      id: 't', duration_days: 3, duration_nights: 2, image_url: 'https://cdn.test/a.jpg', gallery_urls: ['http://insecure.test/b.jpg', 'https://cdn.test/c.jpg'],
      itinerary: [
        { day: 1, title: 'Cairo', city: 'Cairo', meals: { breakfast: 'none', lunch: 'external', dinner: 'included' }, attractions: ['Giza Pyramids'] },
        { day: 2, title: 'Luxor', city: 'Luxor', meals: { breakfast: 'included', lunch: 'none', dinner: 'none' } },
        { day: 3, title: 'Home', city: 'Luxor', accommodation_type: 'none', meals: { breakfast: 'included', lunch: 'none', dinner: 'none' } },
      ],
      main_attractions: ['Giza Pyramids', 'Karnak'], highlights: null,
      inclusions: ['Guide', 'Transfers'], exclusions: ['Flights'], departure_days: ['fri', 'mon'], is_active: true,
    },
    variations: [
      { tier: 'standard', min_pax: 2, max_pax: 16, inclusions: ['3-star hotels'], exclusions: null, is_active: true },
      { tier: 'deluxe', min_pax: 2, max_pax: 8, inclusions: ['5-star hotels', 'Guide'], exclusions: ['Tips'], is_active: true },
    ],
    departures: [],
    policy: null,
    currency: 'EUR',
    tierLabels: new Map([['standard', 'Standard'], ['deluxe', 'Deluxe']]),
    eu: results({ standard: { complete: true, pp: 500 }, deluxe: { complete: true, pp: 800 } }),
    other: results({ standard: { complete: true, pp: 500 }, deluxe: { complete: true, pp: 800 } }),
    publicRate: { tier: 'standard', currency: 'EUR', bands: [{ minPax: 2, maxPax: 3, perPerson: 540 }, { minPax: 4, maxPax: 16, perPerson: 500 }] },
    indicativeCurrencies: [],
    fx: [],
    today: TODAY,
    ...over,
  }
}

describe('the price: the approved public rate, and only that', () => {
  it('the approved bands, "from" their lowest price, in the agency\'s tier word', () => {
    const f = assembleTourFacts(input())
    expect(f.price).toEqual({
      status: 'available', currency: 'EUR', tierLabel: 'Standard', fromPrice: 500,
      bands: [{ minPax: 2, maxPax: 3, perPerson: 540 }, { minPax: 4, maxPax: 16, perPerson: 500 }], indicative: [],
    })
  })
  it('never the engine\'s figures and never a nationality — whatever the engine says today', () => {
    const f = assembleTourFacts(input({
      eu: results({ standard: { complete: true, pp: 777, table: { 2: 777, 4: 666 } } }),
      other: results({ standard: { complete: true, pp: 444, table: { 2: 444, 4: 333 } } }),
    }))
    expect(f.price.fromPrice).toBe(500)
    expect(JSON.stringify(f)).not.toMatch(/777|666|444|333|nationalit|passport|\beu\b|other"/i)
  })
  it('no approved rate: price on request, no amount anywhere, and the page cannot be published', () => {
    const f = assembleTourFacts(input({
      publicRate: null,
      indicativeCurrencies: ['USD'], fx: [{ base_currency: 'EUR', target_currency: 'USD', rate: 1.1, last_updated_at: TODAY.toISOString() }],
    }))
    expect(f.price).toEqual({ status: 'on_request', currency: 'EUR', tierLabel: null, fromPrice: null, bands: [], indicative: [] })
    expect(f.publishable.ok).toBe(false)
    expect(f.publishable.reasons).toContain('The tour has no public price yet — review the price and publish it.')
  })
  it('a rate approved in another currency than the company now runs is on request until approved again', () => {
    const f = assembleTourFacts(input({ currency: 'USD' }))
    expect(f.price).toMatchObject({ status: 'on_request', fromPrice: null, bands: [] })
    expect(f.publishable.reasons).toContain('The public price was approved in another currency — review it and publish it again.')
  })
  it('what is included and where it sleeps follow the approved tier, even when another is cheaper', () => {
    const f = assembleTourFacts(input({ publicRate: { tier: 'deluxe', currency: 'EUR', bands: [{ minPax: 2, maxPax: 8, perPerson: 800 }] } }))
    expect(f.price.tierLabel).toBe('Deluxe')
    expect(f.inclusions).toContain('5-star hotels')
    expect(f.groupSize).toEqual({ min: 2, max: 8 })
  })
  it('indicative conversions: a rate at most 2 days old — direct or inverse; stale or missing means none', () => {
    const fresh = TODAY.toISOString()
    const stale = new Date(TODAY.getTime() - 3 * 86400_000).toISOString()
    const f = assembleTourFacts(input({
      indicativeCurrencies: ['USD', 'GBP', 'JPY'],
      fx: [
        { base_currency: 'EUR', target_currency: 'USD', rate: 1.08, last_updated_at: fresh },
        { base_currency: 'GBP', target_currency: 'EUR', rate: 1.25, last_updated_at: fresh },
        { base_currency: 'EUR', target_currency: 'JPY', rate: 160, last_updated_at: stale },
      ],
    }))
    expect(f.price.indicative).toEqual([
      { currency: 'USD', rate: 1.08, rateDate: '2026-10-25' },
      { currency: 'GBP', rate: 0.8, rateDate: '2026-10-25' },
    ])
  })
})

describe('the rest of the facts', () => {
  const f = assembleTourFacts(input())

  it('days as the records state them: meals provided (in the rate or bought), sights, nights', () => {
    expect(f.days).toEqual([
      { day: 1, title: 'Cairo', city: 'Cairo', overnight: true, meals: { breakfast: false, lunch: true, dinner: true }, sights: ['Giza Pyramids'] },
      { day: 2, title: 'Luxor', city: 'Luxor', overnight: true, meals: { breakfast: true, lunch: false, dinner: false }, sights: [] },
      { day: 3, title: 'Home', city: 'Luxor', overnight: false, meals: { breakfast: true, lunch: false, dinner: false }, sights: [] },
    ])
  })
  it('a one-day tour never has a night, and takes the tour\'s attractions as its day\'s', () => {
    const one = assembleTourFacts(input({ template: { ...input().template, duration_days: 1, itinerary: [{ day: 1, city: 'Giza', meals: {} }] } }))
    expect(one.days[0]).toMatchObject({ overnight: false, sights: ['Giza Pyramids', 'Karnak'] })
  })
  it('inclusions and exclusions: the tour\'s plus the priced tier\'s, once each', () => {
    expect(f.inclusions).toEqual(['Guide', 'Transfers', '3-star hotels'])
    expect(f.exclusions).toEqual(['Flights'])
  })
  it('group size from the priced tier\'s variation', () => {
    expect(f.groupSize).toEqual({ min: 2, max: 16 })
  })
  it('where it sleeps, from the engine\'s priced lines — never an unpriced one', () => {
    const g = assembleTourFacts(input({
      other: results({ standard: { complete: true, pp: 500, services: [
        { property: { kind: 'hotel', name: 'Nile View', city: 'Cairo' } },
        { property: { kind: 'hotel', name: 'Nile View', city: 'Cairo' } },
        { property: { kind: 'cruise', name: 'MS Example' } },
        { property: { kind: 'hotel', name: 'Missing Rate', city: 'Luxor' }, unpriced: true },
        { serviceType: 'guide' },
      ] } }),
    }))
    expect(g.accommodation).toEqual([{ kind: 'hotel', name: 'Nile View', city: 'Cairo' }, { kind: 'cruise', name: 'MS Example', city: null }])
  })
  it('departure days in week order; nothing stated means nothing shown (never "daily")', () => {
    expect(f.departureDays).toEqual(['mon', 'fri'])
    expect(assembleTourFacts(input({ template: { ...input().template, departure_days: [] } })).departureDays).toEqual([])
  })
  it('upcoming departures only: open, guaranteed or full, soonest first, with seats left', () => {
    const g = assembleTourFacts(input({ departures: [
      { start_date: '2026-12-01', end_date: '2026-12-04', status: 'open', max_pax: 12, booked_pax: 9 },
      { start_date: '2026-11-01', end_date: '2026-11-01', status: 'guaranteed', max_pax: null, booked_pax: 3 },
      { start_date: '2026-10-01', end_date: null, status: 'open', max_pax: 12, booked_pax: 0 },
      { start_date: '2026-11-10', end_date: null, status: 'cancelled', max_pax: 12, booked_pax: 0 },
      { start_date: '2026-11-15', end_date: null, status: 'full', max_pax: 12, booked_pax: 14 },
    ] }))
    expect(g.departures).toEqual([
      { date: '2026-11-01', endDate: null, status: 'guaranteed', seatsLeft: null },
      { date: '2026-11-15', endDate: null, status: 'full', seatsLeft: 0 },
      { date: '2026-12-01', endDate: '2026-12-04', status: 'open', seatsLeft: 3 },
    ])
  })
  it('cancellation terms from the policy: tiers far to near, wording only in the page\'s language', () => {
    const policy = { tiers: [{ days_before: 7, charge_percent: 50 }, { days_before: 30, charge_percent: 25 }, { days_before: 'x' }], wording: { fr: 'Conditions…' } }
    expect(assembleTourFacts(input({ policy })).cancellation).toEqual({
      tiers: [{ daysBefore: 30, chargePercent: 25 }, { daysBefore: 7, chargePercent: 50 }], wording: null })
    expect(assembleTourFacts(input({ policy, language: 'fr' })).cancellation!.wording).toBe('Conditions…')
    expect(f.cancellation).toBeNull()
  })
  it('only https images', () => {
    expect(f.images).toEqual(['https://cdn.test/a.jpg', 'https://cdn.test/c.jpg'])
  })
  it('the thin-page rule names each reason', () => {
    const g = assembleTourFacts(input({ template: { ...input().template, itinerary: [], inclusions: [] }, variations: [] }))
    expect(g.publishable).toEqual({ ok: false, reasons: ['The tour has no days.', 'The tour lists nothing it includes.'] })
    expect(f.publishable).toEqual({ ok: true, reasons: [] })
  })
  it('fits the contract, which itself refuses an amount on a price on request', () => {
    expect(tourFactsSchema.parse(f)).toEqual(f)
    const bad = { ...f, price: { ...f.price, status: 'on_request' as const } }
    expect(() => tourFactsSchema.parse(bad)).toThrow(/carries no amount/)
    // The contract itself has no room for a nationality price…
    expect(() => tourFactsSchema.parse({ ...f, price: { ...f.price, byNationality: { eu: 1, other: 2 } } })).toThrow()
    // …nor for a "from" that is not the lowest band, nor bands with a gap.
    expect(() => tourFactsSchema.parse({ ...f, price: { ...f.price, fromPrice: 540 } })).toThrow(/lowest band/)
    expect(() => tourFactsSchema.parse({ ...f, price: { ...f.price, bands: [{ minPax: 2, maxPax: 3, perPerson: 540 }, { minPax: 5, maxPax: 16, perPerson: 500 }] } })).toThrow(/contiguous/)
  })
})

// ---------- the loader: what it asks the engine for ----------

const engine = vi.fn()
vi.mock('@/lib/auto-pricing-service', () => ({ calculateMultiTierPricing: (...a: unknown[]) => engine(...a) }))
vi.mock('@/lib/rates/run-currency', () => ({ getTenantRunCurrency: async () => 'EUR' }))
vi.mock('@/lib/vocabulary-server', () => ({
  tierLadderForTenant: async () => ['standard'],
  vocabularyLabelsForTenant: async () => new Map([['standard', 'Standard']]),
}))
const { loadTourFacts } = await import('@/lib/publish/tour-facts')

function fakeDb(tables: Record<string, Array<Record<string, unknown>>>) {
  return {
    from(table: string) {
      const filters: Array<(r: Record<string, unknown>) => boolean> = []
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q },
        gte: (c: string, v: string) => { filters.push(r => String(r[c]) >= v); return q },
        in: (c: string, v: unknown[]) => { filters.push(r => v.includes(r[c])); return q },
        order: () => q,
        limit: () => q,
        rows: () => (tables[table] ?? []).filter(r => filters.every(f => f(r))),
        maybeSingle: async () => ({ data: q.rows()[0] ?? null, error: null }),
        then: (res: (v: { data: unknown; error: null }) => unknown) => res({ data: q.rows(), error: null }),
      }
      return q
    },
  }
}

describe('loadTourFacts', () => {
  beforeEach(() => {
    engine.mockReset()
    engine.mockResolvedValue(results({ standard: { complete: true, pp: 500 } }))
  })
  const T = 'tenant-1'
  const tables = (margin: number | null, policyId: string | null = null) => ({
    tour_templates: [{ ...input().template, id: 'tour-1', tenant_id: T, cancellation_policy_id: policyId }],
    tour_variations: [{ template_id: 'tour-1', tenant_id: T, tier: 'standard', min_pax: 2, max_pax: 10, inclusions: [], exclusions: [], is_active: true }],
    tour_departures: [],
    tenants: [{ id: T, default_margin_percent: margin }],
    cancellation_policies: [
      { id: 'p-default', tenant_id: T, is_default: true, tiers: [{ days_before: 30, charge_percent: 20 }], wording: {} },
      { id: 'p-own', tenant_id: T, is_default: false, tiers: [{ days_before: 60, charge_percent: 10 }], wording: {} },
    ],
    exchange_rates: [],
    publish_pages: [{ tenant_id: T, tour_template_id: 'tour-1', public_rate: { tier: 'standard', currency: 'EUR', bands: [{ minPax: 2, maxPax: 10, perPerson: 450 }] } }],
  })

  it('shows the approved public rate it reads from the tour\'s page — not the engine\'s 500', async () => {
    const f = await loadTourFacts(fakeDb(tables(30)) as never, { tenantId: T, templateId: 'tour-1', language: 'en', indicativeCurrencies: [], today: TODAY })
    expect(f.price).toMatchObject({ status: 'available', fromPrice: 450, bands: [{ minPax: 2, maxPax: 10, perPerson: 450 }] })
  })
  it('a malformed stored rate is no rate: price on request', async () => {
    const t = tables(30); t.publish_pages[0].public_rate = { tier: 'standard', currency: 'EUR', bands: [{ minPax: 2, maxPax: 3, perPerson: 1 }, { minPax: 6, maxPax: 9, perPerson: 1 }] }
    const f = await loadTourFacts(fakeDb(t) as never, { tenantId: T, templateId: 'tour-1', language: 'en', indicativeCurrencies: [], today: TODAY })
    expect(f.price.status).toBe('on_request')
  })
  it('runs the engine on both bases for 2 travellers at the company\'s house margin (for what the tier includes)', async () => {
    await loadTourFacts(fakeDb(tables(32)) as never, { tenantId: T, templateId: 'tour-1', language: 'en', indicativeCurrencies: [], today: TODAY })
    expect(engine.mock.calls).toEqual([
      ['tour-1', T, ['standard'], 2, true, { marginPercent: 32 }],
      ['tour-1', T, ['standard'], 2, false, { marginPercent: 32 }],
    ])
  })
  it('25% only when the company has no house margin — never 0% by accident; a set 0% is kept', async () => {
    await loadTourFacts(fakeDb(tables(null)) as never, { tenantId: T, templateId: 'tour-1', language: 'en', indicativeCurrencies: [], today: TODAY })
    expect(engine.mock.calls[0][5]).toEqual({ marginPercent: 25 })
    engine.mockClear()
    await loadTourFacts(fakeDb(tables(0)) as never, { tenantId: T, templateId: 'tour-1', language: 'en', indicativeCurrencies: [], today: TODAY })
    expect(engine.mock.calls[0][5]).toEqual({ marginPercent: 0 })
  })
  it('a tour\'s own cancellation policy wins over the company default', async () => {
    const own = await loadTourFacts(fakeDb(tables(30, 'p-own')) as never, { tenantId: T, templateId: 'tour-1', language: 'en', indicativeCurrencies: [], today: TODAY })
    expect(own.cancellation!.tiers).toEqual([{ daysBefore: 60, chargePercent: 10 }])
    const dflt = await loadTourFacts(fakeDb(tables(30)) as never, { tenantId: T, templateId: 'tour-1', language: 'en', indicativeCurrencies: [], today: TODAY })
    expect(dflt.cancellation!.tiers).toEqual([{ daysBefore: 30, chargePercent: 20 }])
  })
  it('another company\'s tour is not found', async () => {
    await expect(loadTourFacts(fakeDb(tables(30)) as never, { tenantId: 'other', templateId: 'tour-1', language: 'en', indicativeCurrencies: [], today: TODAY }))
      .rejects.toThrow(/does not exist for this company/)
  })
})

describe('the template\'s details (migration 444)', () => {
  const day = (over: Record<string, unknown> = {}) => input({
    language: 'fr',
    template: { ...input().template, duration_days: 1, duration_nights: 0, duration_hours: 7, tour_type: 'day_tour', pickup_required: null, transportation_city: 'Cairo',
      meeting_point: 'Hotel lobby', guide_languages: ['en', 'fr', 'xx1'],
      itinerary: [{ day: 1, city: 'Giza', title: 'Giza', meals: {}, stops: [{ time: '08:00', name: 'Pickup' }, { time: '8am', name: 'Giza Pyramids' }, { time: '09:00', name: '' }] }], ...over },
    tourTypeLabels: new Map([['day_tour', 'Excursion']]),
    faq: { en: [{ question: 'Q?', answer: 'A.' }], fr: [{ question: 'Q ?', answer: 'R.' }, { question: 'Sans réponse', answer: '' }] },
  })
  it('states what the records hold, in the page language — and nothing they do not', () => {
    const f = assembleTourFacts(day())
    expect(f.days[0].stops).toEqual([{ time: '08:00', name: 'Pickup' }, { time: null, name: 'Giza Pyramids' }])
    expect(f.guideLanguages).toEqual(['Anglais', 'Français'])
    expect(f.faq).toEqual([{ question: 'Q ?', answer: 'R.' }])
    expect(f.durationHours).toBe(7)
    expect(f.tourType).toBe('Excursion')
    // pickup not stated, but a meeting point is: shown, with no pickup claimed
    expect(f.pickup).toEqual({ included: false, area: null, meetingPoint: 'Hotel lobby' })
    expect(tourFactsSchema.safeParse(f).success).toBe(true)
  })
  it('nothing stated, nothing shown', () => {
    const f = assembleTourFacts(day({ meeting_point: null, guide_languages: [], itinerary: [{ day: 1, city: 'Giza' }] }))
    expect(f.pickup).toBeNull()
    expect(f.guideLanguages).toEqual([])
    expect(f.days[0].stops).toBeUndefined()
  })
})
