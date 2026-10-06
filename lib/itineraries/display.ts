// ============================================
// How an itinerary's stored words read on its page
// ============================================
// Two things on the itinerary page read like debug output:
//
//   · service names saved as codes — "airport_transfer sedan Cairo",
//     "full_service CAI", "checkin_assist" — because a rate's key travelled
//     into the line's name;
//   · the Notes box showing "Created via Pricing Grid | B2C | 2 pax", which
//     the Grid's save writes, as if a person had written it.
//
// Display only: what is stored is unchanged. Pure, for the page and tests.

const WORDS: Record<string, string> = {
  checkin: 'check-in',
  checkout: 'check-out',
}

/** "airport_transfer sedan Cairo" → "Airport transfer sedan Cairo". A name
 *  already written for people (no underscores) is left exactly as it is. */
export function serviceLabel(name: string | null | undefined): string {
  const raw = String(name ?? '').trim()
  if (!raw.includes('_')) return raw
  const words = raw
    .replace(/_+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    // Codes stay codes ("CAI"); ordinary words are lower-cased, then the
    // first letter of the whole name is capitalised.
    .map(w => (/^[A-Z0-9]{2,4}$/.test(w) ? w : WORDS[w.toLowerCase()] ?? w.toLowerCase()))
  // A city keeps its capital: it was capitalised in the source.
  const original = raw.replace(/_+/g, ' ').split(/\s+/).filter(Boolean)
  const restored = words.map((w, i) => (/^[A-Z][a-z]/.test(original[i] ?? '') ? original[i] : w))
  const text = restored.join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "hotel_service" → "Hotel service". */
export function serviceTypeLabel(type: string | null | undefined): string {
  const text = String(type ?? '').replace(/_+/g, ' ').trim().toLowerCase()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}

const SYSTEM_NOTE = /^created via ([^|\n]+?)((?:\s*\|\s*[^|\n]+)*)\s*(?:\n|$)/i

/**
 * The Notes field, split into what the system wrote ("Pricing Grid · B2C ·
 * 2 pax") and what a person wrote (the rest, or null).
 */
export function splitSystemNote(notes: string | null | undefined): { source: string | null; note: string | null } {
  const text = String(notes ?? '').trim()
  const m = text.match(SYSTEM_NOTE)
  if (!m) return { source: null, note: text || null }
  const parts = [m[1], ...m[2].split('|')].map(p => p.trim()).filter(Boolean)
  const rest = text.slice(m[0].length).trim()
  return { source: parts.join(' · '), note: rest || null }
}
