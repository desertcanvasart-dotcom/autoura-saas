// ============================================
// City zones — the parts of a city that change a transfer's price
// ============================================
// Migration 469, docs/transport-zones/PLAN.md. Each city has its own list of
// zones (Cairo: Cairo · 6th of October & Sheikh Zayed · New Cairo · New
// Capital); one of them is the city's DEFAULT — the zone a hotel or transport
// card with no zone belongs to.
//
// Pure and import-free: the settings API validates with it and the settings
// page groups with it (a client component must not reach server-only code).

export interface CityZone {
  id: string
  city: string
  key: string
  label: string
  is_default: boolean
  rank: number
}

export const ZONE_COLS = 'id, tenant_id, city, key, label, is_default, rank, created_at, updated_at'

/** The tenant's owner is its first admin (see the vocabulary API). */
export const ZONE_WRITE_ROLES = ['owner', 'admin']

export const ZONE_WRITE_DENIED =
  'Only the agency owner or an admin can change zones. Ask one of them to make the change, or to make you an admin under Settings → User Management.'

/** Cities are stored as typed; they match ignoring capitals and spaces at the ends. */
export const cityMatch = (city: unknown) => String(city ?? '').trim().toLowerCase()

const LABEL_MAX = 60

/** "6th of October & Sheikh Zayed" → "6th_of_october_sheikh_zayed". */
export function zoneKeyFromLabel(label: string): string {
  const base = label
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50)
  return base || 'zone'
}

/** A key not yet used in the city: "west_bank", then "west_bank_2", … */
export function uniqueZoneKey(label: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = zoneKeyFromLabel(label)
  if (!used.has(base)) return base
  for (let n = 2; ; n++) if (!used.has(`${base}_${n}`)) return `${base}_${n}`
}

/** The zones of one city, from all of a tenant's zones. */
export const zonesOfCity = <T extends Pick<CityZone, 'city'>>(zones: readonly T[], city: unknown): T[] =>
  zones.filter(z => cityMatch(z.city) === cityMatch(city))

/** Cities with their zones — default first, then by rank — cities A→Z. */
export function groupZonesByCity<T extends CityZone>(zones: readonly T[]): Array<{ city: string; zones: T[] }> {
  const by = new Map<string, { city: string; zones: T[] }>()
  for (const z of zones) {
    const k = cityMatch(z.city)
    if (!by.has(k)) by.set(k, { city: z.city.trim(), zones: [] })
    by.get(k)!.zones.push(z)
  }
  return [...by.values()]
    .map(g => ({ ...g, zones: [...g.zones].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.rank - b.rank || a.label.localeCompare(b.label)) }))
    .sort((a, b) => a.city.localeCompare(b.city))
}

export type ZoneVerdict =
  | { ok: true; city: string; label: string }
  | { ok: false; error: string }

/**
 * A new zone or a renamed one. `existing` is every zone the tenant has;
 * `selfId` is the zone being renamed (it may keep its own label).
 */
export function validateZone(
  input: { city?: unknown; label?: unknown },
  existing: readonly Pick<CityZone, 'id' | 'city' | 'label'>[],
  selfId?: string,
): ZoneVerdict {
  const city = String(input.city ?? '').trim()
  const label = String(input.label ?? '').trim().replace(/\s+/g, ' ')
  if (!city) return { ok: false, error: 'Choose the city this zone is in.' }
  if (!label) return { ok: false, error: 'Give the zone a name, for example "West Bank".' }
  if (label.length > LABEL_MAX) return { ok: false, error: `Keep the name under ${LABEL_MAX} characters.` }
  const clash = zonesOfCity(existing, city).find(z => z.id !== selfId && z.label.trim().toLowerCase() === label.toLowerCase())
  if (clash) return { ok: false, error: `${city} already has a zone called "${clash.label}".` }
  return { ok: true, city, label }
}

/**
 * Whether a zone may be deleted. The default goes last: a city with zones
 * always has a default, or a hotel with no zone would belong nowhere.
 */
export function canDeleteZone(zone: Pick<CityZone, 'id' | 'city' | 'is_default' | 'label'>, existing: readonly Pick<CityZone, 'id' | 'city'>[]): { ok: true } | { ok: false; error: string } {
  if (zone.is_default && zonesOfCity(existing, zone.city).some(z => z.id !== zone.id)) {
    return { ok: false, error: `"${zone.label}" is ${zone.city}'s default zone. Make another ${zone.city} zone the default first.` }
  }
  return { ok: true }
}
