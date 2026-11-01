// ============================================
// A connected supplier's own profile, as their agency sees it
// ============================================
// What the supplier wrote about themselves in the network form (kinds,
// cities, languages, about) plus where their network check stands. Shown on
// the agency's supplier card for suppliers connected to that agency. Cities
// and languages are read through normalizePicks, so a profile saved before
// the pick-lists still shows in the list's words. Pure, client-safe.

import { normalizePicks } from '@/lib/supplier-network-lists'

export interface ConnectedProfile {
  display_name: string
  kinds: string[]
  cities: string[]
  languages: string[]
  about: string | null
  /** unverified · pending · verified · rejected */
  verification_status: string
  /** Visible in the network search: verified AND they chose to be found. */
  in_network: boolean
}

export function toConnectedProfile(p: Record<string, unknown>): ConnectedProfile {
  const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(String) : [])
  const cities = normalizePicks(arr(p.cities), 'city')
  const languages = normalizePicks(arr(p.languages), 'language')
  const status = typeof p.verification_status === 'string' ? p.verification_status : 'unverified'
  return {
    display_name: String(p.display_name ?? ''),
    kinds: arr(p.kinds),
    // Matched words first; anything unmatched still shows as they wrote it.
    cities: [...cities.known, ...cities.unknown],
    languages: [...languages.known, ...languages.unknown],
    about: typeof p.about === 'string' && p.about.trim() ? p.about : null,
    verification_status: status,
    in_network: status === 'verified' && p.listed === true,
  }
}

/** Where their network check stands, in words for the agency. */
export const NETWORK_STATUS_FOR_AGENCY: Record<string, string> = {
  unverified: 'Not sent for checking',
  pending: 'Being checked by Autoura',
  verified: 'Verified by Autoura',
  rejected: 'Not verified',
}
