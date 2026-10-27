// ============================================
// Fact slots — where narrative points at a fact instead of stating it
// ============================================
// The engine never writes a price, a duration, a group size, a departure day
// or a cancellation term. When a sentence needs one, it places a slot token;
// the renderer fills it from the tour's facts (lib/publish/contract.ts
// TourFacts) every time the page is built, so the narrative stays true when
// the record changes. A slot is offered only when its fact exists — never a
// slot that would render empty.

import type { TourFacts } from '../contract'

export const SLOT_KEYS = ['price_from', 'duration', 'group_size', 'departure_days', 'next_departure', 'cancellation'] as const
export type SlotKey = typeof SLOT_KEYS[number]

/** What each slot shows, for the engine's prompt (not the value). */
export const SLOT_MEANING: Record<SlotKey, string> = {
  price_from: 'the starting price per person',
  duration: 'how many days and nights the tour lasts',
  group_size: 'the group size',
  departure_days: 'the weekdays it departs',
  next_departure: 'the next departure date',
  cancellation: 'a short statement of the cancellation terms',
}

/** The slots this tour can fill right now. */
export function availableSlots(facts: TourFacts | null): SlotKey[] {
  if (!facts) return []
  const out: SlotKey[] = ['duration']
  if (facts.price.status === 'available' && facts.price.from) out.push('price_from')
  if (facts.groupSize && (facts.groupSize.min !== null || facts.groupSize.max !== null)) out.push('group_size')
  if (facts.departureDays.length > 0) out.push('departure_days')
  if (facts.departures.some(d => d.status !== 'full')) out.push('next_departure')
  if (facts.cancellation && facts.cancellation.tiers.length > 0) out.push('cancellation')
  return out
}

/**
 * Names the records give the tour — cities, sights, hotels, ships — which a
 * narrative may use as written even when they contain digits or numerals
 * ("KV62", "Ramses II", "MS Nile 1886"). The post-check masks them.
 */
export function namesFromFacts(facts: TourFacts | null, extra: string[] = []): string[] {
  if (!facts) return extra
  return [
    ...extra,
    // Names only. Day titles and highlights are operator PHRASES ("Luxor in
    // two days", "budget tour") — masking them could let a number through.
    ...facts.days.flatMap(d => [d.city ?? '', ...d.sights]),
    ...facts.mainAttractions,
    ...facts.accommodation.flatMap(a => [a.name, a.city ?? '']),
  ].filter(n => n.trim().length > 1)
}
