import { describe, it, expect } from 'vitest'
import { FEED_KEY, feedOf, feedTour, hashFeedKey, newFeedKey, siteForFeedKey } from '@/lib/publish/feed'
import { feedKeyOf, newFeedKeyFor, type Actor, type AdminDeps } from '@/lib/publish/admin'
import type { PagePayload, TourFacts } from '@/lib/publish/contract'

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
