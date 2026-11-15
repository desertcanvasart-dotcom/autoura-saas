import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { resolveZoneChoice, zoneInUseError, zoneLabel, type CityZone } from '@/lib/rates/city-zones'
import { checkHotelZone, syncHotelZone } from '@/lib/rates/hotel-zone'
import { RATE_TABLE_CONFIGS } from '@/lib/bulk-rate-service'

const zones: CityZone[] = [
  { id: '1', city: 'Cairo', key: 'cairo', label: 'Cairo', is_default: true, rank: 1 },
  { id: '2', city: 'Cairo', key: '6th_of_october_sheikh_zayed', label: '6th of October & Sheikh Zayed', is_default: false, rank: 2 },
  { id: '3', city: 'Luxor', key: 'east_bank', label: 'East Bank', is_default: true, rank: 1 },
  { id: '4', city: 'Luxor', key: 'west_bank', label: 'West Bank', is_default: false, rank: 2 },
]

describe('resolveZoneChoice — the area a hotel is saved with', () => {
  it('accepts a key or a name, ignoring capitals, and stores the key', () => {
    expect(resolveZoneChoice(zones, 'Luxor', 'west_bank')).toEqual({ ok: true, zone: 'west_bank' })
    expect(resolveZoneChoice(zones, 'luxor', 'WEST BANK')).toEqual({ ok: true, zone: 'west_bank' })
    expect(resolveZoneChoice(zones, 'Cairo', '6th of October & Sheikh Zayed')).toEqual({ ok: true, zone: '6th_of_october_sheikh_zayed' })
  })
  it('refuses an area of another city', () => {
    const v = resolveZoneChoice(zones, 'Cairo', 'West Bank')
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.error).toContain("not one of Cairo's zones")
  })
  it('refuses an area for a city with no zones', () => {
    expect(resolveZoneChoice(zones, 'Aswan', 'West Bank')).toMatchObject({ ok: false })
  })
  it('blank is the default — unless required and the city has zones (D7)', () => {
    expect(resolveZoneChoice(zones, 'Luxor', '')).toEqual({ ok: true, zone: null })
    const v = resolveZoneChoice(zones, 'Luxor', '', { required: true })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.error).toBe('Choose the area of Luxor this hotel is in (East Bank, West Bank).')
    // A city with no zones needs none, even when required.
    expect(resolveZoneChoice(zones, 'Aswan', '', { required: true })).toEqual({ ok: true, zone: null })
  })
  it('shows a stored key by its name', () => {
    expect(zoneLabel(zones, 'luxor', 'west_bank')).toBe('West Bank')
    expect(zoneLabel(zones, 'Luxor', null)).toBe('')
  })
})

describe('zoneInUseError — a zone hotels are in is not deleted', () => {
  it('names the hotels', () => {
    expect(zoneInUseError({ label: 'West Bank', city: 'Luxor' }, [])).toBeNull()
    expect(zoneInUseError({ label: 'West Bank', city: 'Luxor' }, ['Al Moudira'])).toBe('1 hotel is in "West Bank" (Al Moudira). Move it to another Luxor area under Rates → Hotels first.')
    expect(zoneInUseError({ label: 'West Bank', city: 'Luxor' }, ['A', 'B', 'C', 'D', 'A'])).toContain('4 hotels are in "West Bank" (A, B, C and 1 more)')
  })
})

// A recording stub for the server helpers.
function stubDb(zoneRows: unknown[]) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = []
  const chain = (table: string, op: string): Record<string, unknown> => {
    const c: Record<string, unknown> = {}
    for (const m of ['eq', 'neq', 'ilike']) c[m] = (...args: unknown[]) => { calls.push({ table, op: m, args }); return c }
    c.then = (res: (v: unknown) => unknown) => Promise.resolve(res({ data: zoneRows, error: null }))
    return c
  }
  const db = {
    from: (table: string) => ({
      select: (cols: string) => { calls.push({ table, op: 'select', args: [cols] }); return chain(table, 'select') },
      update: (row: unknown) => { calls.push({ table, op: 'update', args: [row] }); return chain(table, 'update') },
    }),
  }
  return { db, calls }
}

describe('server helpers', () => {
  it('checkHotelZone reads the company\'s zones and requires one in a zoned city', async () => {
    const { db, calls } = stubDb(zones)
    expect(await checkHotelZone(db, 't1', 'Luxor', '')).toMatchObject({ ok: false })
    expect(await checkHotelZone(db, 't1', 'Luxor', 'West Bank')).toEqual({ ok: true, zone: 'west_bank' })
    expect(calls).toContainEqual({ table: 'city_zones', op: 'eq', args: ['tenant_id', 't1'] })
  })
  it('syncHotelZone moves the hotel\'s other rows in the same city to the same area', async () => {
    const { db, calls } = stubDb([])
    await syncHotelZone(db, { tenantId: 't1', rowId: 'r1', propertyId: 'p1', city: ' Luxor ', zone: 'west_bank' })
    expect(calls).toEqual([
      { table: 'accommodation_rates', op: 'update', args: [{ zone: 'west_bank' }] },
      { table: 'accommodation_rates', op: 'eq', args: ['tenant_id', 't1'] },
      { table: 'accommodation_rates', op: 'eq', args: ['property_id', 'p1'] },
      { table: 'accommodation_rates', op: 'neq', args: ['id', 'r1'] },
      { table: 'accommodation_rates', op: 'ilike', args: ['city', 'Luxor'] },
    ])
  })
  it('syncHotelZone does nothing for a hotel with no property or city', async () => {
    const { db, calls } = stubDb([])
    await syncHotelZone(db, { tenantId: 't1', rowId: 'r1', propertyId: null, city: 'Luxor', zone: 'west_bank' })
    expect(calls).toEqual([])
  })
})

describe('wiring', () => {
  const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')
  it('both hotel save routes check and store the zone', () => {
    for (const f of ['app/api/rates/hotels/route.ts', 'app/api/rates/hotels/[id]/route.ts']) {
      const src = read(f)
      expect(src).toMatch(/checkHotelZone\(supabase, authResult\.tenant_id!, body\.city, body\.zone\)/)
      expect(src).toMatch(/zone: zoneChoice\.zone/)
      expect(src).toMatch(/syncHotelZone\(/)
    }
  })
  it('the hotel sheet carries a Zone column', () => {
    expect(RATE_TABLE_CONFIGS.accommodation_rates.columns.map(c => c.name)).toContain('zone')
  })
  it('migration 470 adds the column with the key rule', () => {
    const sql = read('supabase/migrations/470_hotel_zone.sql')
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS zone TEXT/)
    expect(sql).toMatch(/zone IS NULL OR zone ~ '\^\[a-z0-9\]\[a-z0-9_\]\{0,59\}\$'/)
  })
})
