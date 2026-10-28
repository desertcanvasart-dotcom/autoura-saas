// ============================================
// Publish — the data feed for an agency's own developer
// ============================================
// Operator, 2026-10-28 (the own-website plan, option 4): an agency whose
// developer builds its website gets its tours as data — the same published
// tours, live prices, facts and approved text as its Autoura website.
//
//   GET /api/publish/feed/v1/tours?lang=en          the published tours (cards)
//   GET /api/publish/feed/v1/tours/{slug}?lang=en   one tour, in full
//   Authorization: Bearer <feed key>
//
// The key is secret (server to server — it is not for a browser page): it
// is shown once when made and stored only as a SHA-256 hash in
// publish_sites.settings.feed { hash, prefix, created_at }. A new key
// replaces the old one at once. Read only; published pages only.

import { createHash, randomBytes } from 'node:crypto'
import type { PagePayload } from './contract'
import { narrativeText } from '../../sites/themes/blocks/narrative'

export const FEED_KEY = /^apf_[A-Za-z0-9_-]{32,64}$/

export function newFeedKey(): string {
  return `apf_${randomBytes(30).toString('base64url')}`
}

export const hashFeedKey = (key: string) => createHash('sha256').update(key).digest('hex')

export interface FeedSettings { hash: string; prefix: string; created_at: string }

export function feedOf(settings: unknown): FeedSettings | null {
  const f = (settings && typeof settings === 'object' ? (settings as Record<string, unknown>).feed : null) as Record<string, unknown> | null | undefined
  return typeof f?.hash === 'string' && /^[0-9a-f]{64}$/.test(f.hash) && typeof f.prefix === 'string'
    ? { hash: f.hash, prefix: f.prefix, created_at: String(f.created_at ?? '') }
    : null
}

type Db = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

/** The site a feed key opens; null for an unknown key or a suspended site. */
export async function siteForFeedKey(db: Db, key: string): Promise<{ id: string; tenantId: string; languages: string[] } | null> {
  if (!FEED_KEY.test(key)) return null
  const { data, error } = await db.from('publish_sites').select('id, tenant_id, status, languages, settings')
    .eq('settings->feed->>hash', hashFeedKey(key)).maybeSingle()
  if (error) throw new Error(`reading the feed key: ${error.message}`)
  if (!data || data.status === 'suspended' || feedOf(data.settings)?.hash !== hashFeedKey(key)) return null
  return { id: data.id, tenantId: data.tenant_id, languages: data.languages }
}

/** One tour as the feed gives it: facts as records, approved text as plain text. */
export function feedTour(page: PagePayload) {
  const facts = page.tour?.facts ?? null
  const narrative = page.tour?.narrative ?? null
  const lang = page.language
  return {
    slug: page.path.replace(/^tours\//, ''),
    url_path: `/${lang}/${page.path}`,
    language: lang,
    name: page.tour?.name ?? page.title,
    text: {
      overview: narrativeText(narrative?.overview, facts, lang),
      highlights: (narrative?.highlights ?? []).map(h => narrativeText(h, facts, lang)).filter((h): h is string => !!h),
      days: (narrative?.days ?? []).map(d => ({ day: d.day, text: narrativeText(d.segments, facts, lang) })).filter(d => d.text),
      seo: narrative?.seo ?? null,
    },
    facts,
  }
}
