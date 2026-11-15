// ============================================
// A hotel's area (zone) — read and kept in step on save
// ============================================
// Migration 470, docs/transport-zones/PLAN.md step 2. Server side: the hotel
// routes check the zone against the city's zones (lib/rates/city-zones.ts)
// and keep every rate row of the same hotel in the same area.

import { resolveZoneChoice, type CityZone, type ZoneChoice } from '@/lib/rates/city-zones'

// Structural seams: the typed RLS client and test stubs both fit.
interface ZoneRead { eq(c: string, v: string): PromiseLike<{ data: unknown; error: unknown }> }
interface SiblingUpdate {
  eq(c: string, v: string): SiblingUpdate
  neq(c: string, v: string): SiblingUpdate
  ilike(c: string, v: string): PromiseLike<{ error: unknown }>
}
interface Db {
  from(table: string): {
    select(cols: string): ZoneRead
    update(row: Record<string, unknown>): SiblingUpdate
  }
}

/** The company's zones (every city). An unreadable table reads as none. */
export async function loadCityZones(dbIn: unknown, tenantId: string): Promise<CityZone[]> {
  const db = dbIn as Db
  const { data, error } = await db.from('city_zones').select('id, city, key, label, is_default, rank').eq('tenant_id', tenantId)
  if (error) throw error
  return (data ?? []) as CityZone[]
}

/** A hotel saved from the form: its city's zones decide, and one is required if any exist (D7). */
export async function checkHotelZone(dbIn: unknown, tenantId: string, city: unknown, zone: unknown): Promise<ZoneChoice> {
  return resolveZoneChoice(await loadCityZones(dbIn, tenantId), city, zone, { required: true })
}

/**
 * One hotel, one area: the other rate rows of the same hotel in the same city
 * take the zone just saved, so the engine never sees the hotel in two places.
 */
export async function syncHotelZone(dbIn: unknown, opts: { tenantId: string; rowId: string; propertyId: string | null | undefined; city: string | null | undefined; zone: string | null }) {
  if (!opts.propertyId || !opts.city) return
  const db = dbIn as Db
  const { error } = await db.from('accommodation_rates').update({ zone: opts.zone })
    .eq('tenant_id', opts.tenantId)
    .eq('property_id', opts.propertyId)
    .neq('id', opts.rowId)
    .ilike('city', opts.city.trim())
  // Best effort: the row the user saved is saved; a sibling left behind shows
  // in the hotel list's Area column.
  if (error) console.error('sync hotel zone error:', error)
}
