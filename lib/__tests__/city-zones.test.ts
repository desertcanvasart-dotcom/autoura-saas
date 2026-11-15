import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { canDeleteZone, cityMatch, groupZonesByCity, uniqueZoneKey, validateZone, zoneKeyFromLabel, zonesOfCity, type CityZone } from '@/lib/rates/city-zones'

const z = (id: string, city: string, label: string, extra: Partial<CityZone> = {}): CityZone =>
  ({ id, city, key: zoneKeyFromLabel(label), label, is_default: false, rank: 0, ...extra })

const cairo = [
  z('1', 'Cairo', 'Cairo', { is_default: true, rank: 1 }),
  z('2', 'Cairo', '6th of October & Sheikh Zayed', { rank: 2 }),
  z('3', 'cairo ', 'New Cairo', { rank: 3 }),
]
const luxor = [z('4', 'Luxor', 'West Bank', { rank: 2 }), z('5', 'Luxor', 'East Bank', { is_default: true, rank: 1 })]

describe('zone keys', () => {
  it('turns a name into a stable key', () => {
    expect(zoneKeyFromLabel('6th of October & Sheikh Zayed')).toBe('6th_of_october_sheikh_zayed')
    expect(zoneKeyFromLabel('South of the Aswan bridge')).toBe('south_of_the_aswan_bridge')
    expect(zoneKeyFromLabel('  ')).toBe('zone')
  })
  it('never reuses a key in the city', () => {
    expect(uniqueZoneKey('West Bank', ['west_bank'])).toBe('west_bank_2')
    expect(uniqueZoneKey('West Bank', ['west_bank', 'west_bank_2'])).toBe('west_bank_3')
    expect(uniqueZoneKey('West Bank', [])).toBe('west_bank')
  })
  it('fits the database rule for a key', () => {
    for (const label of ['6th of October & Sheikh Zayed', 'Élite Zone', 'A'.repeat(80)]) {
      expect(zoneKeyFromLabel(label)).toMatch(/^[a-z0-9][a-z0-9_]{0,59}$/)
    }
  })
})

describe('cities match ignoring capitals and spaces', () => {
  it('groups "Cairo" and "cairo " as one city', () => {
    expect(cityMatch(' Cairo ')).toBe(cityMatch('cairo'))
    expect(zonesOfCity([...cairo, ...luxor], 'CAIRO')).toHaveLength(3)
  })
  it('lists cities A→Z, the default first, then by order', () => {
    const g = groupZonesByCity([...luxor, ...cairo])
    expect(g.map(x => x.city)).toEqual(['Cairo', 'Luxor'])
    expect(g[0].zones.map(x => x.label)).toEqual(['Cairo', '6th of October & Sheikh Zayed', 'New Cairo'])
    expect(g[1].zones.map(x => x.label)).toEqual(['East Bank', 'West Bank'])
  })
})

describe('validateZone', () => {
  it('needs a city and a name', () => {
    expect(validateZone({ city: '', label: 'West Bank' }, [])).toMatchObject({ ok: false })
    expect(validateZone({ city: 'Luxor', label: '  ' }, [])).toMatchObject({ ok: false })
  })
  it('refuses a second zone with the same name in the city', () => {
    const v = validateZone({ city: 'luxor', label: 'west bank' }, luxor)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.error).toBe('Luxor already has a zone called "West Bank".')
  })
  it('allows the same name in another city', () => {
    expect(validateZone({ city: 'Aswan', label: 'West Bank' }, luxor)).toEqual({ ok: true, city: 'Aswan', label: 'West Bank' })
  })
  it('lets a zone keep its own name on rename, and tidies spaces', () => {
    expect(validateZone({ city: 'Luxor', label: 'West  Bank' }, luxor, '4')).toEqual({ ok: true, city: 'Luxor', label: 'West Bank' })
  })
})

describe('canDeleteZone', () => {
  it('keeps the default while the city has other zones', () => {
    expect(canDeleteZone(cairo[0], cairo)).toMatchObject({ ok: false })
  })
  it('allows any other zone, and the last zone of a city', () => {
    expect(canDeleteZone(cairo[1], cairo)).toEqual({ ok: true })
    expect(canDeleteZone(cairo[0], [cairo[0]])).toEqual({ ok: true })
  })
})

describe('migration 469', () => {
  const sql = readFileSync(path.join(process.cwd(), 'supabase/migrations/469_city_zones.sql'), 'utf8')
  it('scopes the table to the company and allows one default per city', () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/tenant_id = get_user_tenant_id\(\)/)
    expect(sql).toMatch(/city_zones_one_default_idx[\s\S]*WHERE is_default/)
    expect(sql).toMatch(/city_zones_key_idx[\s\S]*lower\(btrim\(city\)\), key/)
  })
})
