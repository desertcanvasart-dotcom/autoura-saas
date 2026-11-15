import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isNonDefaultZone, resolveCardSights, zoneInUseError, type CityZone } from '@/lib/rates/city-zones'
import { RATE_TABLE_CONFIGS, exportCellValue } from '@/lib/bulk-rate-service'
import { PREFERRED_SCOPES } from '@/lib/rates/preferred'

const zones: CityZone[] = [
  { id: '1', city: 'Luxor', key: 'east_bank', label: 'East Bank', is_default: true, rank: 1 },
  { id: '2', city: 'Luxor', key: 'west_bank', label: 'West Bank', is_default: false, rank: 2 },
]

describe('isNonDefaultZone — which cards wait for step 4', () => {
  it('no area, or the city default, is the city card as before', () => {
    expect(isNonDefaultZone(zones, 'Luxor', null)).toBe(false)
    expect(isNonDefaultZone(zones, 'luxor', 'east_bank')).toBe(false)
  })
  it('another area is not', () => {
    expect(isNonDefaultZone(zones, 'Luxor', 'west_bank')).toBe(true)
    // An area the city no longer has is not the default either.
    expect(isNonDefaultZone(zones, 'Aswan', 'east_bank')).toBe(true)
  })
})

describe('resolveCardSights', () => {
  const fees = ['Karnak Temple', 'Luxor Temple', 'Valley Of Kings']
  it('takes fee-sheet names ignoring capitals, in the sheet\'s spelling, once each', () => {
    expect(resolveCardSights(['karnak temple', 'Luxor Temple', 'KARNAK TEMPLE'], fees)).toEqual({ ok: true, sights: ['Karnak Temple', 'Luxor Temple'] })
    expect(resolveCardSights('Karnak Temple; valley of kings', fees)).toEqual({ ok: true, sights: ['Karnak Temple', 'Valley Of Kings'] })
    expect(resolveCardSights('', fees)).toEqual({ ok: true, sights: [] })
  })
  it('refuses a name not on the sheet', () => {
    const v = resolveCardSights(['Karnak', 'Luxor Temple'], fees)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.error).toContain('"Karnak"')
  })
})

describe('zoneInUseError with cards', () => {
  it('names hotels and cards', () => {
    expect(zoneInUseError({ label: 'West Bank', city: 'Luxor' }, [], ['LUXOR-AIRPORT-WEST'])).toBe('1 transport card prices it (LUXOR-AIRPORT-WEST). Move it to another Luxor area under Rates → Transportation first.')
    expect(zoneInUseError({ label: 'West Bank', city: 'Luxor' }, ['Al Moudira'], ['A', 'B'])).toBe('1 hotel is in "West Bank" (Al Moudira); 2 transport cards price it (A, B). Move them to another Luxor area under Rates → Hotels and Rates → Transportation first.')
  })
})

describe('sheet, star and engine wiring', () => {
  it('the transport sheet carries Zone and Sights Covered; sights export as a list', () => {
    const names = RATE_TABLE_CONFIGS.transportation_rates.columns.map(c => c.name)
    expect(names).toContain('zone')
    expect(names).toContain('covers_sights')
    expect(exportCellValue('transportation_rates', { covers_sights: ['Karnak Temple', 'Luxor Temple'] }, 'covers_sights')).toBe('Karnak Temple; Luxor Temple')
  })
  it('the star scope separates areas', () => {
    expect(PREFERRED_SCOPES.transportation_rates.columns).toContain('zone')
  })
  it('the engine leaves out non-default-area cards until step 4, and keeps every card if zones cannot be read', () => {
    const src = readFileSync(path.join(process.cwd(), 'lib/auto-pricing-service.ts'), 'utf8')
    expect(src).toMatch(/\.filter\(r => !zones \|\| !isNonDefaultZone\(zones, r\.city, \(r as \{ zone\?: string \| null \}\)\.zone\)\)/)
    expect(src).toMatch(/if \(error\) \{ console\.error\('city zones read error:', error\); return null \}/)
  })
  it('migration 471 adds the columns and puts the area in the route\'s unique index', () => {
    const sql = readFileSync(path.join(process.cwd(), 'supabase/migrations/471_transport_card_zone.sql'), 'utf8')
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS zone TEXT/)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS covers_sights TEXT\[\] NOT NULL DEFAULT '\{\}'/)
    expect(sql).toMatch(/coalesce\(area, ''\), coalesce\(zone, ''\),/)
  })
})

// ---- saveRoute against a recording stub ----
const state: { inserted: Record<string, unknown>[]; updated: Record<string, unknown>[]; existing: Record<string, unknown>[] } = { inserted: [], updated: [], existing: [] }
function chain(table: string) {
  const c: Record<string, unknown> = {}
  let mode = 'select'
  let payload: Record<string, unknown> | null = null
  for (const m of ['eq', 'in', 'neq', 'ilike']) c[m] = () => c
  c.select = () => c
  c.single = () => {
    if (mode === 'insert') { state.inserted.push(payload!); return Promise.resolve({ data: { id: 'new', ...payload }, error: null }) }
    if (mode === 'update') { state.updated.push(payload!); return Promise.resolve({ data: { id: 'old', ...payload }, error: null }) }
    return Promise.resolve({ data: null, error: null })
  }
  c.insert = (row: Record<string, unknown>) => { mode = 'insert'; payload = row; return c }
  c.update = (row: Record<string, unknown>) => { mode = 'update'; payload = row; return c }
  c.delete = () => c
  c.then = (res: (v: unknown) => unknown) => {
    const data = table === 'city_zones' ? zones
      : table === 'entrance_fees' ? [{ attraction_name: 'Karnak Temple' }, { attraction_name: 'Luxor Temple' }]
        : table === 'transportation_rates' ? state.existing : []
    return Promise.resolve(res({ data, error: null }))
  }
  return c
}
vi.mock('@/lib/supabase-server', () => ({ createAdminClient: () => ({ from: (t: string) => chain(t) }), requireAuth: vi.fn() }))
vi.mock('@/lib/vocabulary-server', () => ({ loadVocabularyForTenant: async () => [] }))

describe('saveRoute — a card saves its area and sights', () => {
  beforeEach(() => { state.inserted = []; state.updated = []; state.existing = [] })
  const body = { route_name: 'LUXOR-EAST-BANK-WEST-HOTELS', service_type: 'day_tour', city: 'Luxor', vehicles: [{ vehicle_type: 'sedan', rate_eur: 30 }] }

  it('stores the area key and the sights in the sheet\'s spelling', async () => {
    const { saveRoute } = await import('@/app/api/resources/transportation/route')
    const r = await saveRoute('t1', { ...body, zone: 'West Bank', covers_sights: ['karnak temple', 'Luxor Temple'] }, [])
    expect(r.status).toBe(200)
    expect(state.inserted[0]).toMatchObject({ zone: 'west_bank', covers_sights: ['Karnak Temple', 'Luxor Temple'] })
  })
  it('refuses an area of another city and an unknown sight', async () => {
    const { saveRoute } = await import('@/app/api/resources/transportation/route')
    expect((await saveRoute('t1', { ...body, city: 'Aswan', zone: 'West Bank' }, [])).status).toBe(400)
    expect((await saveRoute('t1', { ...body, covers_sights: ['Karnak'] }, [])).status).toBe(400)
  })
  it('blank area is the default (null); not sent keeps the stored area while it still fits the city', async () => {
    const { saveRoute } = await import('@/app/api/resources/transportation/route')
    await saveRoute('t1', { ...body, zone: '' }, [])
    expect(state.inserted[0]).toMatchObject({ zone: null, covers_sights: [] })
    state.existing = [{ id: 'old', vehicle_type: 'sedan', zone: 'west_bank', covers_sights: ['Karnak Temple'] }]
    await saveRoute('t1', body, ['old'])
    expect(state.updated[0]).toMatchObject({ zone: 'west_bank', covers_sights: ['Karnak Temple'] })
    state.updated = []
    await saveRoute('t1', { ...body, city: 'Aswan' }, ['old'])
    expect(state.updated[0]).toMatchObject({ zone: null })
  })
})
