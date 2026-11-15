// ============================================
// Publish — the data feed for an agency's own developer
// ============================================
// Operator, 2026-10-28 (the own-website plan, option 4): an agency whose
// developer builds its website gets its tours as data — the same published
// tours, live prices, facts and approved text as its Autoura website.
//
//   GET /api/publish/feed/v1/tours?lang=en          the published tours (cards)
//   GET /api/publish/feed/v1/tours/{slug}?lang=en   one tour, in full
//   GET /api/publish/feed/v1/seasons[?date=…]       the peak calendar (prices on peak dates)
//   Authorization: Bearer <feed key>
//
// The key is secret (server to server — it is not for a browser page): it
// is shown once when made and stored only as a SHA-256 hash in
// publish_sites.settings.feed { hash, prefix, created_at }. A new key
// replaces the old one at once. Read only; published pages only.

import { createHash, randomBytes } from 'node:crypto'
import type { FeedSeasons, PagePayload } from './contract'
import { seasonForDate, type SeasonWindow } from '../pricing/season-uplift'
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

// ---------- the peak calendar (contract.ts feedSeasonsSchema) ----------
// The agency's Seasonal Premiums (Settings, migration 304) as the feed gives
// them, so its website can tell whether a chosen departure date is peak and
// price it the way a quote would. Same rule as quotes: inactive seasons and
// 0% seasons charge nothing and are left out; overlaps take the highest.

export interface SeasonRow { id: string; name: string | null; uplift_percent: number | string | null; is_active: boolean | null }
export interface SeasonDateRow { season_id: string; start_date: string; end_date: string; label: string | null }

const ymd = (v: string) => String(v).slice(0, 10)

/** Pure: the calendar from its rows, windows ending before `asOf` dropped. */
export function feedSeasons(seasons: SeasonRow[], dates: SeasonDateRow[], asOf: string, date?: string | null): FeedSeasons {
  const live = new Map(seasons
    .filter(s => s.is_active !== false && Number(s.uplift_percent) > 0)
    .map(s => [s.id, { name: String(s.name ?? ''), upliftPercent: Number(s.uplift_percent) }]))
  const windows: SeasonWindow[] = dates.flatMap(d => {
    const s = live.get(d.season_id)
    return s ? [{ seasonId: d.season_id, name: s.name, upliftPercent: s.upliftPercent, startDate: ymd(d.start_date), endDate: ymd(d.end_date) }] : []
  })
  const out: FeedSeasons = {
    asOf,
    rule: { matchBy: 'departure_date', overlap: 'highest_wins', appliesTo: 'per_person_band' },
    seasons: [...live].flatMap(([id, s]) => {
      const ranges = dates.filter(d => d.season_id === id && ymd(d.end_date) >= asOf)
        .map(d => ({ start: ymd(d.start_date), end: ymd(d.end_date), label: d.label ?? null }))
        .sort((a, b) => a.start.localeCompare(b.start))
      return ranges.length ? [{ name: s.name, upliftPercent: s.upliftPercent, ranges }] : []
    }).sort((a, b) => a.ranges[0].start.localeCompare(b.ranges[0].start)),
  }
  if (date) {
    const m = seasonForDate(windows, date)
    out.date = { date, season: m ? { name: m.name, upliftPercent: m.upliftPercent } : null }
  }
  return out
}

/** A band's per-person price on a departure in a season of this premium. */
export function peakPerPerson(perPerson: number, upliftPercent: number): number {
  return Math.round(perPerson * (1 + Math.max(0, upliftPercent) / 100) * 100) / 100
}

/** The tenant's calendar, read for the feed. */
export async function loadFeedSeasons(db: Db, tenantId: string, asOf: string, date?: string | null): Promise<FeedSeasons> {
  const [s, d] = await Promise.all([
    db.from('pricing_seasons').select('id, name, uplift_percent, is_active').eq('tenant_id', tenantId),
    db.from('pricing_season_dates').select('season_id, start_date, end_date, label').eq('tenant_id', tenantId),
  ])
  if (s.error) throw new Error(`reading the seasons: ${s.error.message}`)
  if (d.error) throw new Error(`reading the season dates: ${d.error.message}`)
  return feedSeasons(s.data ?? [], d.data ?? [], asOf, date)
}
