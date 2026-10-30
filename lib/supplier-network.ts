// ============================================
// The shared supplier network (Phase 3, migration 453) — pure rules
// ============================================
// docs/supplier-network/PLAN.md §7. A supplier account joins with a profile
// other agencies may see once the Autoura team has verified it; an agency
// using the network adds it to its OWN book. Prices are agreed per request —
// nothing here carries a rate, a phone or an email.

export const SOURCING = ['own', 'network', 'both'] as const
export type Sourcing = (typeof SOURCING)[number]

export const SOURCING_LABEL: Record<Sourcing, string> = {
  own: 'Own suppliers only',
  network: 'Network suppliers only',
  both: 'Own and network suppliers',
}

export function isSourcing(v: unknown): v is Sourcing {
  return typeof v === 'string' && (SOURCING as readonly string[]).includes(v)
}

/** May this agency search the network? */
export function usesNetwork(sourcing: string | null | undefined): boolean {
  return sourcing === 'network' || sourcing === 'both'
}

/** The kinds of supplier a profile may say it is (the same words as supplier_type). */
export const NETWORK_KINDS: Record<string, string> = {
  transport_company: 'Transport',
  guide: 'Guide',
  restaurant: 'Restaurant',
  hotel: 'Hotel',
  cruise: 'Nile cruise',
  activity_provider: 'Activities',
}

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
  const cities = list(b.cities, 20, 60)
  if (cities.length === 0) return { ok: false, error: 'Type at least one city you work in' }
  const about = typeof b.about === 'string' && b.about.trim() ? b.about.trim().slice(0, 1000) : null
  return { ok: true, value: { display_name: name, kinds, cities, languages: list(b.languages, 12, 40), about, listed: b.listed === true } }
}

export interface PublicProfile {
  account_id: string
  display_name: string
  kinds: string[]
  cities: string[]
  languages: string[]
  about: string | null
}

/** What another agency sees: never a phone, an email, papers or a note from the review. */
export function toPublicProfile(p: Record<string, unknown>): PublicProfile {
  return {
    account_id: String(p.account_id),
    display_name: String(p.display_name ?? ''),
    kinds: Array.isArray(p.kinds) ? (p.kinds as string[]) : [],
    cities: Array.isArray(p.cities) ? (p.cities as string[]) : [],
    languages: Array.isArray(p.languages) ? (p.languages as string[]) : [],
    about: typeof p.about === 'string' ? p.about : null,
  }
}

const norm = (s: string) => s.trim().toLowerCase()

/** The network search: by kind, city and language (each optional, case-insensitive). */
export function matchesSearch(p: PublicProfile, q: { kind?: string | null; city?: string | null; language?: string | null; text?: string | null }): boolean {
  if (q.kind && !p.kinds.includes(q.kind)) return false
  if (q.city && !p.cities.some(c => norm(c) === norm(q.city!))) return false
  if (q.language && !p.languages.some(l => norm(l) === norm(q.language!))) return false
  if (q.text && !norm(`${p.display_name} ${p.about ?? ''}`).includes(norm(q.text))) return false
  return true
}

/** Verification states, in words for the supplier. */
export const VERIFICATION_LABEL: Record<string, string> = {
  unverified: 'Not sent for checking yet',
  pending: 'Being checked by Autoura',
  verified: 'Verified — agencies can find you',
  rejected: 'Not verified — see the note and send again',
}
