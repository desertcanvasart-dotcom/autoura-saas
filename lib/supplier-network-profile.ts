// ============================================
// Checking a supplier's network profile before it is saved (server)
// ============================================
// Moved out of lib/supplier-network (which client components import) when
// cities and languages became pick-lists: the reading rules
// (lib/supplier-network-picks) stay on the server.

import { NETWORK_KINDS } from '@/lib/supplier-network'
import { normalizePicks } from '@/lib/supplier-network-picks'

const list = (v: unknown, max: number, len: number): string[] =>
  [...new Set((Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [])
    .map(x => String(x).trim().replace(/\s+/g, ' ').slice(0, len))
    .filter(Boolean))].slice(0, max)

export interface ProfileInput {
  display_name: string
  kinds: string[]
  cities: string[]
  languages: string[]
  about: string | null
  listed: boolean
}

/** Check what a supplier typed for their network profile. */
export function cleanProfile(body: unknown): { ok: true; value: ProfileInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const name = typeof b.display_name === 'string' ? b.display_name.trim().replace(/\s+/g, ' ') : ''
  if (name.length < 2 || name.length > 120) return { ok: false, error: 'Type the name agencies should see (2–120 letters)' }
  const kinds = list(b.kinds, 6, 40).filter(k => k in NETWORK_KINDS)
  if (kinds.length === 0) return { ok: false, error: 'Choose at least one kind of service' }
  // Cities and languages come from fixed lists (lib/supplier-network-lists),
  // so a search for "Luxor" or "English" finds them (2026-11-01).
  const cities = normalizePicks(list(b.cities, 40, 60), 'city')
  if (cities.unknown.length) return { ok: false, error: `Pick your cities from the list (we don't know: ${cities.unknown.join(', ')})` }
  if (cities.known.length === 0) return { ok: false, error: 'Pick at least one city you work in' }
  const languages = normalizePicks(list(b.languages, 30, 40), 'language')
  if (languages.unknown.length) return { ok: false, error: `Pick your languages from the list (we don't know: ${languages.unknown.join(', ')})` }
  const about = typeof b.about === 'string' && b.about.trim() ? b.about.trim().slice(0, 1000) : null
  return {
    ok: true,
    value: { display_name: name, kinds, cities: cities.known.slice(0, 20), languages: languages.known.slice(0, 12), about, listed: b.listed === true },
  }
}
