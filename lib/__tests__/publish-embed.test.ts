import { describe, it, expect } from 'vitest'
import { embedOf, newEmbedKey, normalizeOrigin, resolveSiteByEmbedKey, EMBED_KEY } from '@/lib/publish/embed'
import { embedPath, frameAncestors } from '../../sites/lib/routing'
import { embedLanding } from '../../sites/lib/lead-capture'

// ============================================================================
// Tours on the agency's OWN website (operator, 2026-10-28). What it proves:
//   · a block appears only on the websites the agency listed (frame-ancestors);
//   · the key names a site and grants nothing on its own — an unknown key, a
//     suspended site or a site with no website listed shows nothing;
//   · an enquiry's landing page counts only from a listed website.
// ============================================================================

const KEY = 'AbCdEfGhJkMnPqRsTuVwXyZ2'

describe('website addresses', () => {
  it('keeps only the origin, https (or http on localhost for testing)', () => {
    expect(normalizeOrigin('https://www.Agency.com/tours?x=1')).toBe('https://www.agency.com')
    expect(normalizeOrigin('www.agency.com')).toBe('https://www.agency.com')
    expect(normalizeOrigin('http://agency.localhost:8898/page')).toBe('http://agency.localhost:8898')
    expect(normalizeOrigin('http://www.agency.com')).toBeNull()
    expect(normalizeOrigin('javascript:alert(1)')).toBeNull()
    expect(normalizeOrigin('intranet')).toBeNull()
    expect(normalizeOrigin('')).toBeNull()
  })
  it('a stored setting is read defensively: a bad key or address is ignored', () => {
    expect(embedOf({ embed: { key: KEY, origins: ['https://a.com', 'nonsense', 'https://a.com/x'] } })).toEqual({ key: KEY, origins: ['https://a.com'] })
    expect(embedOf({ embed: { key: 'short', origins: [] } })).toEqual({ key: null, origins: [] })
    expect(embedOf(null)).toEqual({ key: null, origins: [] })
  })
  it('keys are long and random', () => {
    const k = newEmbedKey()
    expect(k).toMatch(EMBED_KEY)
    expect(newEmbedKey()).not.toBe(k)
  })
})

describe('the key → the site', () => {
  const site = (over: Record<string, unknown> = {}) => ({
    id: 's1', tenant_id: 't1', archetype: 'modern', status: 'draft', languages: ['en', 'fr'], brand: {},
    settings: { embed: { key: KEY, origins: ['https://www.agency.com'] } }, tenants: { company_name: 'Sunrise' }, ...over,
  })
  const db = (rows: Array<Record<string, unknown>>) => ({
    from: () => {
      let key = ''
      const q = {
        select: () => q,
        eq: (col: string, v: string) => { if (col === 'settings->embed->>key') key = v; return q },
        maybeSingle: async () => ({ data: rows.find(r => (r.settings as { embed?: { key?: string } })?.embed?.key === key) ?? null, error: null }),
      }
      return q
    },
  })
  it('finds the site and where its blocks may appear', async () => {
    expect(await resolveSiteByEmbedKey(db([site()]) as never, KEY)).toEqual({
      site: { id: 's1', tenantId: 't1', archetype: 'modern', status: 'draft', languages: ['en', 'fr'], companyName: 'Sunrise', brand: {} },
      origins: ['https://www.agency.com'],
    })
  })
  it('shows nothing for an unknown key, a suspended site, or no website listed', async () => {
    expect(await resolveSiteByEmbedKey(db([site()]) as never, 'ZZZZZZZZZZZZZZZZZZZZZZZZ')).toBeNull()
    expect(await resolveSiteByEmbedKey(db([site({ status: 'suspended' })]) as never, KEY)).toBeNull()
    expect(await resolveSiteByEmbedKey(db([site({ settings: { embed: { key: KEY, origins: [] } } })]) as never, KEY)).toBeNull()
    expect(await resolveSiteByEmbedKey(db([site()]) as never, 'bad key!')).toBeNull()
  })
})

describe('in the renderer', () => {
  it('reads a block address', () => {
    expect(embedPath(`/embed/${KEY}/fr/tours/giza`)).toEqual({ key: KEY, lang: 'fr', rest: 'tours/giza' })
    expect(embedPath(`/embed/${KEY}/en/enquire`)).toEqual({ key: KEY, lang: 'en', rest: 'enquire' })
    expect(embedPath('/embed/short/en/tours')).toBeNull()
    expect(embedPath('/en/tours')).toBeNull()
  })
  it('only the listed websites may frame a block', () => {
    expect(frameAncestors(['https://www.agency.com', 'https://agency.com'])).toBe("frame-ancestors 'self' https://www.agency.com https://agency.com")
  })
  it('an enquiry\'s landing page counts only from a listed website', () => {
    expect(embedLanding('https://www.agency.com/egypt?utm_campaign=autumn', ['https://www.agency.com'])?.href).toBe('https://www.agency.com/egypt?utm_campaign=autumn')
    expect(embedLanding('https://evil.example/page', ['https://www.agency.com'])).toBeNull()
    expect(embedLanding(null, ['https://www.agency.com'])).toBeNull()
  })
})
