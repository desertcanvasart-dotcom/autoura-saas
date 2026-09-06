// ============================================
// Vocabulary → pixels, without hardcoding words
// ============================================
// Pure helpers behind components/vocabulary: which colour a tier gets (by
// POSITION in the agency's ladder, so "3★ / 4★ / 5★" and "Budget … Luxury"
// both read as a rising scale), how a supplier-type label pluralises for a
// tab, and what a tour variation defaults to for a tier the app has never
// seen. Tested in lib/__tests__/vocabulary-ui.test.ts.

export interface TierPalette {
  /** Small rounded badge. */
  badge: string
  /** Selected button, filled. */
  solid: string
  /** Selected button, outlined (border-2 + tint). */
  outline: string
  /** Selected card: border + tint. */
  card: string
  text: string
  bg: string
  border: string
  ring: string
}

// Tailwind needs these class strings literally in source.
export const TIER_PALETTE: TierPalette[] = [
  { badge: 'bg-gray-100 text-gray-700',     solid: 'bg-gray-600 text-white',    outline: 'border-gray-600 bg-gray-100 text-gray-800',     card: 'border-gray-500 bg-gray-50',     text: 'text-gray-700',    bg: 'bg-gray-50',    border: 'border-gray-200', ring: 'ring-gray-500' },
  { badge: 'bg-blue-100 text-blue-700',     solid: 'bg-blue-600 text-white',    outline: 'border-blue-600 bg-blue-50 text-blue-800',      card: 'border-blue-500 bg-blue-50',     text: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200', ring: 'ring-blue-500' },
  { badge: 'bg-purple-100 text-purple-700', solid: 'bg-purple-600 text-white',  outline: 'border-purple-600 bg-purple-50 text-purple-800', card: 'border-purple-500 bg-purple-50', text: 'text-purple-700',  bg: 'bg-purple-50',  border: 'border-purple-200', ring: 'ring-purple-500' },
  { badge: 'bg-amber-100 text-amber-700',   solid: 'bg-amber-600 text-white',   outline: 'border-amber-600 bg-amber-50 text-amber-800',   card: 'border-amber-500 bg-amber-50',   text: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200', ring: 'ring-amber-500' },
  { badge: 'bg-rose-100 text-rose-700',     solid: 'bg-rose-600 text-white',    outline: 'border-rose-600 bg-rose-50 text-rose-800',      card: 'border-rose-500 bg-rose-50',     text: 'text-rose-700',    bg: 'bg-rose-50',    border: 'border-rose-200', ring: 'ring-rose-500' },
  { badge: 'bg-emerald-100 text-emerald-700', solid: 'bg-emerald-600 text-white', outline: 'border-emerald-600 bg-emerald-50 text-emerald-800', card: 'border-emerald-500 bg-emerald-50', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', ring: 'ring-emerald-500' },
  { badge: 'bg-cyan-100 text-cyan-700',     solid: 'bg-cyan-600 text-white',    outline: 'border-cyan-600 bg-cyan-50 text-cyan-800',      card: 'border-cyan-500 bg-cyan-50',     text: 'text-cyan-700',    bg: 'bg-cyan-50',    border: 'border-cyan-200', ring: 'ring-cyan-500' },
  { badge: 'bg-indigo-100 text-indigo-700', solid: 'bg-indigo-600 text-white',  outline: 'border-indigo-600 bg-indigo-50 text-indigo-800', card: 'border-indigo-500 bg-indigo-50', text: 'text-indigo-700',  bg: 'bg-indigo-50',  border: 'border-indigo-200', ring: 'ring-indigo-500' },
]

/** Colour for the tier at `position` (0 = lowest). A tier the vocabulary
 *  does not know (position -1) reads as plain gray. */
export function paletteAt(position: number): TierPalette {
  if (position < 0) return TIER_PALETTE[0]
  return TIER_PALETTE[position % TIER_PALETTE.length]
}

/** Position of `key` in the agency's ladder — ALL entries in rank order,
 *  hidden ones included, so hiding a middle tier never recolours the rest. */
export function tierPosition(all: { key: string; rank: number }[], key: string | null | undefined): number {
  if (!key) return -1
  return [...all].sort((a, b) => a.rank - b.rank).findIndex(t => t.key === key)
}

/** "Hotel" → "Hotels", "Fleet partner" → "Fleet partners", "Bus" → "Buses",
 *  "Company" → "Companies". Labels already plural are left alone. */
export function pluralize(label: string): string {
  const s = String(label ?? '').trim()
  if (!s) return s
  if (/(us|ss|x|z|ch|sh)$/i.test(s)) return s + 'es'   // Bus → Buses, Coach → Coaches
  if (/s$/i.test(s)) return s                            // Airlines: already plural
  if (/[^aeiou]y$/i.test(s)) return s.slice(0, -1) + 'ies'
  return s + 's'
}

// ------------------------------------------------------------------
// Tour variations: what a brand-new tier defaults to
// ------------------------------------------------------------------
// The tour manager used to carry a defaults block per hardcoded tier. An
// agency may have three tiers or six, so defaults follow POSITION on a
// four-step ladder from "essential, shared" to "exclusive, private".

export interface VariationDefaults {
  icon: string
  description: string
  min_pax: number
  max_pax: number
  group_type: 'shared' | 'private'
  vehicle_type: string
  accommodation_standard: string
  meal_quality: string
}

const LADDER: VariationDefaults[] = [
  { icon: '💰', description: 'Essential experience at best value',        min_pax: 1, max_pax: 15, group_type: 'shared',  vehicle_type: 'standard_van', accommodation_standard: '3_star',      meal_quality: 'basic' },
  { icon: '💎', description: 'Comfortable experience with quality services', min_pax: 1, max_pax: 10, group_type: 'private', vehicle_type: 'modern_van',   accommodation_standard: '4_star',      meal_quality: 'good' },
  { icon: '✨', description: 'Enhanced experience with premium touches',   min_pax: 1, max_pax: 8,  group_type: 'private', vehicle_type: 'premium_van',  accommodation_standard: '4_star_plus', meal_quality: 'premium' },
  { icon: '👑', description: 'Premium experience with exclusive perks',    min_pax: 1, max_pax: 6,  group_type: 'private', vehicle_type: 'luxury_suv',   accommodation_standard: '5_star',      meal_quality: 'gourmet' },
]

/** Defaults for the tier at `position` of `total`. With four tiers this is
 *  exactly the old per-tier block; with three, the middle tier reads as
 *  "comfortable"; with one, it is the top of the ladder. */
export function variationDefaultsAt(position: number, total: number): VariationDefaults {
  if (total <= 1 || position < 0) return { ...LADDER[LADDER.length - 1] }
  const p = Math.min(Math.max(position, 0), total - 1)
  const idx = Math.round((p * (LADDER.length - 1)) / (total - 1))
  return { ...LADDER[idx] }
}
