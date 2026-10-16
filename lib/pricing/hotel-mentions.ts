// ============================================
// Which of the agency's hotels does the text name?
// ============================================
// The parser's AI picks a hotel id from a list. When the text names a hotel
// ("4-Day Stay at Marriott Mena House") the pick must be that hotel, whatever
// tier it is saved under — the AI used to see only the selected tier's
// hotels, and (until the form's name column was read) no names at all, so it
// took any hotel of the tier. This reads the names deterministically, so the
// code — not the model — decides when the text named a hotel.
//
// A hotel's name is matched on its distinctive part: brand and generic
// words are dropped ("Marriott Mena House" → "mena house"; "Steigenberger
// Nile Palace" → "nile palace"), and that phrase must appear as whole words.

const GENERIC = new Set([
  'hotel', 'hotels', 'resort', 'resorts', 'spa', 'the', 'and', '&', 'by', 'a', 'an', 'at', 'of',
  'suites', 'suite', 'inn', 'lodge', 'boutique', 'collection', 'luxury',
])

/** Chains whose name alone says nothing about which property it is. */
const BRANDS = new Set([
  'marriott', 'jw', 'hilton', 'doubletree', 'conrad', 'sheraton', 'westin', 'le', 'meridien', 'ritz', 'carlton',
  'four', 'seasons', 'intercontinental', 'crowne', 'plaza', 'holiday', 'kempinski', 'steigenberger', 'movenpick',
  'mövenpick', 'sofitel', 'novotel', 'ibis', 'pullman', 'fairmont', 'swissotel', 'hyatt', 'grand', 'regency',
  'radisson', 'blu', 'accor', 'oberoi', 'st', 'regis', 'renaissance', 'tolip', 'pyramisa', 'helnan', 'barcelo',
  'rixos', 'jaz', 'tui', 'concorde', 'sonesta', 'pickalbatros', 'albatros', 'kempinsky',
])

export const normaliseText = (s: string) =>
  ` ${String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `

/** The words that identify this property, or '' when nothing distinctive is left. */
export function distinctiveHotelName(name: string): string {
  const words = normaliseText(name).trim().split(' ').filter(Boolean)
  const kept = words.filter(w => !GENERIC.has(w) && !BRANDS.has(w))
  const phrase = kept.join(' ')
  // One short word ("Grand", "Palace") would match half the itineraries.
  return phrase.length >= 5 ? phrase : ''
}

export interface NamedHotel {
  id: string
  name: string
  city?: string | null
  tier?: string | null
}

/** The hotels whose distinctive name appears in the text. */
export function hotelsMentioned<T extends NamedHotel>(text: string, hotels: T[]): T[] {
  const haystack = normaliseText(text)
  return hotels.filter(h => {
    const phrase = distinctiveHotelName(h.name)
    return phrase !== '' && haystack.includes(` ${phrase} `)
  })
}

const sameCity = (a?: string | null, b?: string | null) =>
  !!a && !!b && normaliseText(a) === normaliseText(b)

/**
 * The hotel a day should have, given what the text named. Returns null when
 * the AI's pick already is a named hotel, or the text names none that fits.
 * Among rows of the named hotel, the selected tier's is preferred.
 */
export function namedHotelFor<T extends NamedHotel>(
  pickedId: string | null,
  dayCity: string | null | undefined,
  hotelsById: Map<string, T>,
  mentioned: T[],
  selectedTier: string,
): T | null {
  if (mentioned.length === 0) return null
  if (pickedId && mentioned.some(m => m.id === pickedId)) return null
  const picked = pickedId ? hotelsById.get(pickedId) ?? null : null
  // Same city as the AI's pick or the day; a single named hotel otherwise
  // (a one-hotel stay: Mena House in Giza on a day the AI called "Cairo").
  const inCity = mentioned.filter(m => sameCity(m.city, picked?.city) || sameCity(m.city, dayCity))
  const distinct = new Set(mentioned.map(m => distinctiveHotelName(m.name)))
  const pool = inCity.length > 0 ? inCity : distinct.size === 1 ? mentioned : []
  if (pool.length === 0) return null
  return pool.find(m => (m.tier ?? '') === selectedTier) ?? pool[0]
}
