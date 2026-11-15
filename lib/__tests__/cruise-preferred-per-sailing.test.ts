// A preferred Nile cruise per route, length and weekday — not per tier
// (operator, 2026-11-15; migration 468). Starring the 4-night Luxor → Aswan
// Ceila used to untick the 3-night Aswan → Luxor Ceila, and the engine chose
// among every ship of the tier leaving a city whatever its length.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { cruisesCompete, narrowCruiseCandidates, describeCruiseScope } from '@/lib/rates/cruise-candidates'
import { clearPreferredSiblings, describeScope, rowsShareStar } from '@/lib/rates/preferred'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { getCruiseRates } from '@/lib/auto-pricing-service'

const aswan3 = { tier: 'standard', embark_city: 'Aswan', disembark_city: 'Luxor', duration_nights: [3], sailing_days: ['fri'] }
const luxor4 = { tier: 'standard', embark_city: 'Luxor', disembark_city: 'Aswan', duration_nights: 4, sailing_days: ['mon'] }

describe('which sailings compete for the star', () => {
  it('the opposite route never competes — the case that unticked Ceila', () => {
    expect(cruisesCompete(aswan3, luxor4)).toBe(false)
  })
  it('same route: a different length or a different weekday does not compete', () => {
    expect(cruisesCompete(aswan3, { ...aswan3, duration_nights: 4 })).toBe(false)
    expect(cruisesCompete(aswan3, { ...aswan3, sailing_days: ['wed'] })).toBe(false)
    expect(cruisesCompete(aswan3, { ...aswan3, tier: 'deluxe' })).toBe(false)
  })
  it('same route, length and day competes; a row with no length or no fixed day overlaps any', () => {
    expect(cruisesCompete(aswan3, { ...aswan3, embark_city: 'aswan ' })).toBe(true)
    expect(cruisesCompete(aswan3, { ...aswan3, duration_nights: null })).toBe(true)
    expect(cruisesCompete(aswan3, { ...aswan3, sailing_days: [] })).toBe(true)
    expect(cruisesCompete(aswan3, { ...aswan3, duration_nights: [3, 4], sailing_days: ['mon', 'fri'] })).toBe(true)
  })
  it('the bulk import uses the same rule for two stars in one file', () => {
    expect(rowsShareStar('nile_cruises', aswan3, luxor4)).toBe(false)
    expect(rowsShareStar('nile_cruises', aswan3, { ...aswan3 })).toBe(true)
    expect(rowsShareStar('accommodation_rates', { city: 'Cairo', tier: 'standard' }, { city: 'cairo', tier: 'Standard' })).toBe(true)
  })
  it('the toast names the sailing', () => {
    expect(describeCruiseScope(aswan3)).toBe('standard · Aswan → Luxor · 3 nights · Fri')
    expect(describeScope('nile_cruises', luxor4)).toBe('standard · Luxor → Aswan · 4 nights · Mon')
  })
})

describe('starring a sailing clears only the sailings it competes with', () => {
  it('reads the starred rows of the tier, then clears just the competing ones', async () => {
    const starred = [
      { id: 'c-aswan-3-fri', ...aswan3 },
      { id: 'c-luxor-4-mon', ...luxor4 },
      { id: 'c-aswan-3-any', ...aswan3, sailing_days: [] },
    ]
    const calls: Array<[string, unknown[]]> = []
    type Chain = Record<string, (...a: never[]) => unknown>
    const read: Chain = { eq: () => read, neq: () => read, is: () => read, ilike: (...a: never[]) => { calls.push(['ilike', a]); return read }, then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: starred, error: null }).then(ok) }
    const write: Chain = { eq: () => write, in: (...a: never[]) => { calls.push(['in', a]); return write }, then: (ok: (r: unknown) => unknown) => Promise.resolve({ error: null }).then(ok) }
    const client = { from: () => ({ select: () => read, update: (v: unknown) => { calls.push(['update', [v]]); return write } }) }
    const r = await clearPreferredSiblings(client, 'nile_cruises', 't1', { id: 'new', ...aswan3, embark_city: 'Aswan', ship_name: 'Zeina' }, 'new')
    expect(r.error).toBeNull()
    expect(calls).toEqual([
      ['ilike', ['tier', 'standard']],
      ['update', [{ is_preferred: false }]],
      ['in', ['id', ['c-aswan-3-fri', 'c-aswan-3-any']]],
    ])
  })
})

describe('pricing picks the sailing the tour is', () => {
  const SCOPE = { tenantId: 'test-tenant' }
  beforeAll(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
  })
  beforeEach(() => setMockTables({}))
  const ship = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
    id, ship_name: name, tier: 'standard', is_active: true, embark_city: 'Aswan', disembark_city: 'Luxor', duration_nights: [3],
    sailing_days: ['fri'], ppd_eur: 150, single_supplement_eur: 50, triple_reduction_eur: 0, ...extra,
  })

  it('two starred ships from Aswan, 3 and 4 nights: the length decides', async () => {
    setMockTables({ nile_cruises: [ship('c3', 'Ceila', { is_preferred: true }), ship('c4', 'Zeina', { duration_nights: [4], is_preferred: true })] })
    expect((await getCruiseRates(SCOPE, 'standard', 'Aswan', undefined, { nights: 3 }))?.shipName).toBe('Ceila')
    expect((await getCruiseRates(SCOPE, 'standard', 'Aswan', undefined, { nights: 4 }))?.shipName).toBe('Zeina')
    // Without the length both stars still apply — refused, never a guess.
    expect((await getCruiseRates(SCOPE, 'standard', 'Aswan'))?.ambiguous?.preferredCount).toBe(2)
  })
  it('starred Monday and Friday sailings: the boarding weekday decides', async () => {
    setMockTables({ nile_cruises: [ship('fri', 'Ceila', { is_preferred: true }), ship('mon', 'Adonis', { sailing_days: ['mon'], is_preferred: true })] })
    // 2026-11-20 is a Friday, 2026-11-16 a Monday.
    expect((await getCruiseRates(SCOPE, 'standard', 'Aswan', '2026-11-20', { nights: 3, boardingDate: '2026-11-20' }))?.shipName).toBe('Ceila')
    expect((await getCruiseRates(SCOPE, 'standard', 'Aswan', '2026-11-16', { nights: 3, boardingDate: '2026-11-16' }))?.shipName).toBe('Adonis')
  })
  it('a length or day no ship matches keeps the wider list, priced as before', async () => {
    setMockTables({ nile_cruises: [ship('c3', 'Ceila')] })
    expect((await getCruiseRates(SCOPE, 'standard', 'Aswan', '2026-11-16', { nights: 7, boardingDate: '2026-11-16' }))?.shipName).toBe('Ceila')
  })
  it('narrowing is pure and keeps rows that state no length or no fixed day', () => {
    const rows = [{ id: 'a', duration_nights: [3], sailing_days: ['fri'] }, { id: 'b', duration_nights: null, sailing_days: [] }, { id: 'c', duration_nights: 4, sailing_days: ['fri'] }]
    expect(narrowCruiseCandidates(rows, { nights: 3, boardingDate: '2026-11-20' }).map(r => r.id)).toEqual(['a', 'b'])
    expect(narrowCruiseCandidates(rows, { nights: 3, boardingDate: '2026-11-16' }).map(r => r.id)).toEqual(['b'])
    expect(narrowCruiseCandidates(rows, {}).map(r => r.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('migration 468', () => {
  it('drops the one-preferred-cruise-per-tier index', () => {
    const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '468_cruise_preferred_per_sailing.sql'), 'utf8')
    expect(sql).toMatch(/DROP INDEX IF EXISTS public\.nile_cruises_one_preferred_idx/)
  })
})
