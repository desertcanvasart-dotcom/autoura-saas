// ============================================
// Publish — approved narrative: what it is, and when it may still show
// ============================================
// docs/publish/PLAN.md §10. A page's narrative in one language is a BUNDLE
// of parts — overview, highlights, day narratives, SEO title/description —
// each approved separately. A published version (publish_versions.content)
// is the whole bundle at the moment of an approval: the new part replaces
// the old one, the others carry over.
//
// Facts never wait: prices, inclusions, departures render live from records.
// Text, though, was written about a particular itinerary — so each part
// carries a FINGERPRINT of the facts it was written from (the cities and
// sights it could mention, where the tour sleeps). When the records change
// those, the part stops showing — the page falls back to its facts — until
// a new draft is approved. A day narrative follows its own day only. And a
// part whose fact slot can no longer be filled (the price went on request)
// stops showing too: a slot never renders blank.
//
// Pure: the page endpoint, the approval routes and the tests share it.

import { createHash } from 'node:crypto'
import type { TourFacts } from './contract'
import type { EngineContent } from './engine/engine'
import type { Segment } from './engine/fact-check'
import { availableSlots } from './engine/slots'

export type NarrativePart = 'overview' | 'highlights' | 'days' | 'seo'
export const NARRATIVE_PARTS: readonly NarrativePart[] = ['overview', 'highlights', 'days', 'seo']

/** One approved part, with the fingerprint of the facts it was written from. */
export type StoredPart =
  | { part: 'overview'; segments: Segment[]; fingerprint: string }
  | { part: 'highlights'; items: Segment[][]; fingerprint: string }
  | { part: 'days'; days: Array<{ day: number; segments: Segment[]; fingerprint: string }>; fingerprint: string }
  | { part: 'seo'; title: string; description: string; fingerprint: string }

/** publish_versions.content */
export type NarrativeBundle = Partial<Record<NarrativePart, StoredPart>>

/** What the renderer is sent: only the parts that are still true. */
export interface RenderableNarrative {
  overview: Segment[] | null
  highlights: Segment[][] | null
  days: Array<{ day: number; segments: Segment[] }>
  seo: { title: string; description: string } | null
  /** Parts withheld because the records changed under them — for the admin. */
  stale: string[]
}

const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16)
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/** The whole tour's fingerprint: everything text about it could mention. */
export function tourFingerprint(facts: TourFacts, tourName: string): string {
  return hash({
    name: norm(tourName),
    days: facts.days.map(d => [d.day, norm(d.city), [...d.sights].map(norm).sort(), d.overnight]),
    attractions: [...facts.mainAttractions].map(norm).sort(),
    stays: facts.accommodation.map(a => [a.kind, norm(a.name), norm(a.city)]).sort(),
  })
}

/** One day's fingerprint: what that day's narrative could mention. */
export function dayFingerprint(day: TourFacts['days'][number] | undefined): string {
  if (!day) return 'missing'
  return hash([norm(day.city), [...day.sights].map(norm).sort(), day.overnight, day.meals])
}

/** A fingerprint of the facts as shown — the D15 audit snapshot's key. */
export function factsHash(facts: TourFacts): string {
  return hash({ price: facts.price, inclusions: facts.inclusions, exclusions: facts.exclusions, groupSize: facts.groupSize,
    departureDays: facts.departureDays, cancellation: facts.cancellation })
}

/** An engine draft's content as the part a version stores. */
export function toStoredPart(content: EngineContent, facts: TourFacts, tourName: string): StoredPart {
  const fingerprint = tourFingerprint(facts, tourName)
  switch (content.kind) {
    case 'overview': return { part: 'overview', segments: content.segments, fingerprint }
    case 'highlights': return { part: 'highlights', items: content.items, fingerprint }
    case 'seo': return { part: 'seo', title: content.title, description: content.description, fingerprint }
    case 'days': return {
      part: 'days',
      fingerprint,
      days: content.days.map(d => ({ ...d, fingerprint: dayFingerprint(facts.days.find(f => f.day === d.day)) })),
    }
  }
}

/** The bundle after approving one part. */
export function withPart(previous: NarrativeBundle | null, part: StoredPart): NarrativeBundle {
  return { ...(previous ?? {}), [part.part]: part }
}

const slotsFillable = (segments: Segment[], fillable: Set<string>) =>
  segments.every(s => s.type !== 'slot' || fillable.has(s.slot))

/** The parts of a bundle that may show against today's facts. */
export function renderableNarrative(bundle: NarrativeBundle | null, facts: TourFacts | null, tourName: string): RenderableNarrative {
  const out: RenderableNarrative = { overview: null, highlights: null, days: [], seo: null, stale: [] }
  if (!bundle || !facts) return out
  const current = tourFingerprint(facts, tourName)
  const fillable = new Set<string>(availableSlots(facts))

  const o = bundle.overview
  if (o?.part === 'overview') {
    if (o.fingerprint === current && slotsFillable(o.segments, fillable)) out.overview = o.segments
    else out.stale.push('overview')
  }
  const h = bundle.highlights
  if (h?.part === 'highlights') {
    if (h.fingerprint === current && h.items.every(i => slotsFillable(i, fillable))) out.highlights = h.items
    else out.stale.push('highlights')
  }
  const d = bundle.days
  if (d?.part === 'days') {
    for (const day of d.days) {
      const fact = facts.days.find(f => f.day === day.day)
      if (fact && day.fingerprint === dayFingerprint(fact) && slotsFillable(day.segments, fillable)) out.days.push({ day: day.day, segments: day.segments })
      else out.stale.push(`day ${day.day}`)
    }
  }
  const s = bundle.seo
  if (s?.part === 'seo') {
    if (s.fingerprint === current) out.seo = { title: s.title, description: s.description }
    else out.stale.push('seo')
  }
  return out
}

/** The text of a stored part, as segments — for the post-check on approval. */
export function partSegments(content: EngineContent): Segment[] {
  switch (content.kind) {
    case 'overview': return content.segments
    case 'highlights': return content.items.flat()
    case 'days': return content.days.flatMap(d => d.segments)
    case 'seo': return [{ type: 'text', text: content.title }, { type: 'text', text: content.description }]
  }
}
