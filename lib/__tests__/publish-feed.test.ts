import { describe, it, expect } from 'vitest'
import { FEED_KEY, feedOf, feedSeasons, feedTour, hashFeedKey, loadFeedSeasons, newFeedKey, peakPerPerson, siteForFeedKey, type SeasonDateRow, type SeasonRow } from '@/lib/publish/feed'
import { feedKeyOf, newFeedKeyFor, type Actor, type AdminDeps } from '@/lib/publish/admin'
import { feedSeasonsSchema, type PagePayload, type TourFacts } from '@/lib/publish/contract'

// ============================================================================
// The data feed for an agency's own developer (own-website plan, option 4).
//   · the key is secret: shown once, stored only as a hash; a new key stops
//     the old one at once;
//   · an unknown key, or a suspended site, opens nothing;
//   · a tour comes out with the records' facts and the approved text as plain
//     text — the same tours as the agency's Autoura website.
// ============================================================================

const T = 'tenant-a'
const actor: Actor = { tenantId: T, userId: 'u1', name: 'Mona' }

function makeDb(site: Record<string, unknown>) {
  return {
    site,
    from: () => {
      let hash = ''
      let patch: Record<string, unknown> | null = null
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: string) => { if (c === 'settings->feed->>hash') hash = v; return q },
        update: (p: Record<string, unknown>) => { patch = p; return q },
        maybeSingle: async () => ({ data: hash ? ((site.settings as { feed?: { hash?: string } })?.feed?.hash === hash ? site : null) : site, error: null }),
        then: (res: (v: unknown) => unknown) => { if (patch) Object.assign(site, patch); return res({ data: [site], error: null }) },
      }
      return q
    },
  }
}
const deps = { now: () => new Date('2026-10-28T10:00:00Z'), revalidate: async () => {} } as unknown as AdminDeps

describe('the feed key', () => {
  it('is long and random, and only its hash is kept', async () => {
    const db = makeDb({ id: 's1', tenant_id: T, status: 'draft', languages: ['en'], settings: { indicativeCurrencies: ['USD'] }, archetype: 'modern', brand: {}, tenants: null })
    const { key, prefix } = await newFeedKeyFor(db as never, actor, deps)
    expect(key).toMatch(FEED_KEY)
    expect(key).not.toBe(newFeedKey())
    const stored = JSON.stringify(db.site.settings)
    expect(stored).not.toContain(key)
    expect(db.site.settings).toEqual({ indicativeCurrencies: ['USD'], feed: { hash: hashFeedKey(key), prefix, created_at: '2026-10-28T10:00:00.000Z' } })
    expect(await feedKeyOf(db as never, actor)).toEqual({ exists: true, prefix, createdAt: '2026-10-28T10:00:00.000Z' })
  })
  it('opens its own site; a new key stops the old one; an unknown key or suspended site opens nothing', async () => {
    const db = makeDb({ id: 's1', tenant_id: T, status: 'draft', languages: ['en', 'fr'], settings: {}, archetype: 'modern', brand: {}, tenants: null })
    const { key: first } = await newFeedKeyFor(db as never, actor, deps)
    expect(await siteForFeedKey(db as never, first)).toEqual({ id: 's1', tenantId: T, languages: ['en', 'fr'] })
    const { key: second } = await newFeedKeyFor(db as never, actor, deps)
    expect(await siteForFeedKey(db as never, first)).toBeNull()
    expect(await siteForFeedKey(db as never, second)).not.toBeNull()
    expect(await siteForFeedKey(db as never, 'apf_' + 'x'.repeat(40))).toBeNull()
    expect(await siteForFeedKey(db as never, 'not-a-key')).toBeNull()
    db.site.status = 'suspended'
    expect(await siteForFeedKey(db as never, second)).toBeNull()
  })
  it('a stored setting is read defensively', () => {
    expect(feedOf({ feed: { hash: 'short', prefix: 'apf_' } })).toBeNull()
    expect(feedOf(null)).toBeNull()
  })
})

describe('a tour in the feed', () => {
  it('carries the records\' facts and the approved text as plain text', () => {
    const facts = { days: [{ day: 1, title: 'Giza', city: 'Giza', overnight: false, meals: { breakfast: false, lunch: true, dinner: false }, sights: [] }],
      price: { status: 'available', currency: 'EUR', tierLabel: 'Standard', fromPrice: 99, bands: [{ minPax: 2, maxPax: 6, perPerson: 99 }], indicative: [] },
      durationDays: 1, durationNights: 0 } as unknown as TourFacts
    const page = {
      kind: 'tour', language: 'en', path: 'tours/giza-day', title: 'Giza day',
      tour: { templateId: 't', name: 'Giza day', facts, narrative: {
        overview: [{ type: 'text', text: 'From' }, { type: 'slot', slot: 'price_from' }, { type: 'text', text: '.' }],
        highlights: [[{ type: 'text', text: 'The Sphinx at dawn' }]], days: [{ day: 1, segments: [{ type: 'text', text: 'The plateau.' }] }], seo: null } },
    } as unknown as PagePayload
    expect(feedTour(page)).toMatchObject({
      slug: 'giza-day', url_path: '/en/tours/giza-day', language: 'en', name: 'Giza day',
      text: { overview: expect.stringMatching(/^From .*99 per person\.$/), highlights: ['The Sphinx at dawn'], days: [{ day: 1, text: 'The plateau.' }], seo: null },
      facts,
    })
  })
})

describe('the peak calendar in the feed', () => {
  const seasons: SeasonRow[] = [
    { id: 'win', name: 'Winter peak', uplift_percent: '10.00', is_active: true },
    { id: 'ny', name: 'New Year', uplift_percent: 25, is_active: true },
    { id: 'off', name: 'Switched off', uplift_percent: 50, is_active: false },
    { id: 'zero', name: 'Watching', uplift_percent: 0, is_active: true },
  ]
  const dates: SeasonDateRow[] = [
    { season_id: 'win', start_date: '2026-12-01', end_date: '2027-02-28', label: 'Winter 26/27' },
    { season_id: 'win', start_date: '2025-12-01', end_date: '2026-02-28', label: 'Winter 25/26' },
    { season_id: 'ny', start_date: '2026-12-24', end_date: '2027-01-02', label: null },
    { season_id: 'off', start_date: '2026-12-01', end_date: '2026-12-31', label: null },
    { season_id: 'zero', start_date: '2026-11-01', end_date: '2026-11-30', label: null },
  ]

  it('lists active, charging seasons with the windows still to come, earliest first', () => {
    const out = feedSeasons(seasons, dates, '2026-11-15')
    expect(feedSeasonsSchema.parse(out)).toEqual(out)
    expect(out.rule).toEqual({ matchBy: 'departure_date', overlap: 'highest_wins', appliesTo: 'per_person_band' })
    expect(out.seasons).toEqual([
      { name: 'Winter peak', upliftPercent: 10, ranges: [{ start: '2026-12-01', end: '2027-02-28', label: 'Winter 26/27' }] },
      { name: 'New Year', upliftPercent: 25, ranges: [{ start: '2026-12-24', end: '2027-01-02', label: null }] },
    ])
    expect(out.date).toBeUndefined()
  })
  it('answers for one date: overlapping windows take the highest premium, an ordinary date none', () => {
    expect(feedSeasons(seasons, dates, '2026-11-15', '2026-12-31').date).toEqual({ date: '2026-12-31', season: { name: 'New Year', upliftPercent: 25 } })
    expect(feedSeasons(seasons, dates, '2026-11-15', '2027-02-28').date).toEqual({ date: '2027-02-28', season: { name: 'Winter peak', upliftPercent: 10 } })
    // A switched-off season and a 0% season charge nothing, exactly as in quotes.
    expect(feedSeasons(seasons, dates, '2026-11-15', '2026-11-20').date).toEqual({ date: '2026-11-20', season: null })
  })
  it('prices a band on a peak date as the band × (1 + premium), to the cent', () => {
    expect(peakPerPerson(99, 25)).toBe(123.75)
    expect(peakPerPerson(408.75, 15)).toBe(470.06)
    expect(peakPerPerson(99, 0)).toBe(99)
  })
  it('reads the calendar of the key\'s own tenant only', async () => {
    const asked: Array<[string, string, string]> = []
    const db = { from: (table: string) => {
      const q = { select: () => q, eq: (c: string, v: string) => { asked.push([table, c, v]); return Promise.resolve({ data: table === 'pricing_seasons' ? seasons : dates, error: null }) } }
      return q
    } }
    const out = await loadFeedSeasons(db as never, T, '2026-11-15', '2027-01-01')
    expect(asked).toEqual([['pricing_seasons', 'tenant_id', T], ['pricing_season_dates', 'tenant_id', T]])
    expect(out.date?.season?.name).toBe('New Year')
  })
})
