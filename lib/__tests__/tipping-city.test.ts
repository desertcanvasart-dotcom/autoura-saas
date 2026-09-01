// A tip is a place-specific number: what a driver is tipped in Cairo is not
// what a driver is tipped in Aswan (operator, 1 Sep).
//
// The hazard this guards is the NAIVE reading of a city column. getTippingRate
// summed EVERY active per-day row into one trip-wide number. Add cities to
// that and a trip charges the Cairo driver tip AND the Aswan driver tip on
// every single day. A column that quietly doubles a cost is worse than none.
//
// The rule: rows are grouped by role+context and exactly ONE is charged per
// group — the city's own rate, else the country-wide one, else nothing.
import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables } from './_mock-supabase'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { getTippingRates } from '@/lib/auto-pricing-service'

type Row = {
  role_type: string
  context: string | null
  city: string | null
  rate_eur: number
}

const scope = { tenantId: 'test-tenant', useGlobalCatalog: false } as never

async function resolver(rows: Row[]) {
  setMockTables({
    tipping_rates: rows.map(r => ({
      ...r,
      rate_unit: 'per_day',
      is_active: true,
      tenant_id: 'test-tenant',
      rate_currency: null,
    })),
  } as never)
  return getTippingRates(scope, 'standard' as never)
}

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

describe('city-specific tipping', () => {
  it('prefers the city rate over the country-wide one', async () => {
    const r = await resolver([
      { role_type: 'driver', context: null, city: null, rate_eur: 100 },
      { role_type: 'driver', context: null, city: 'Aswan', rate_eur: 150 },
    ])
    expect(r?.forCity('Aswan')).toBe(150)
    expect(r?.forCity('Cairo')).toBe(100)
  })

  it('charges ONE row per role, never city plus country-wide', async () => {
    // The whole point: the old code summed every row.
    const r = await resolver([
      { role_type: 'driver', context: null, city: null, rate_eur: 100 },
      { role_type: 'driver', context: null, city: 'Aswan', rate_eur: 150 },
      { role_type: 'driver', context: null, city: 'Cairo', rate_eur: 120 },
    ])
    expect(r?.forCity('Aswan')).toBe(150)
  })

  it('still adds DIFFERENT roles together', async () => {
    // One row per role — not one row overall.
    const r = await resolver([
      { role_type: 'driver', context: null, city: null, rate_eur: 100 },
      { role_type: 'guide', context: null, city: null, rate_eur: 200 },
    ])
    expect(r?.forCity('Cairo')).toBe(300)
  })

  it('prices exactly as before when no row names a city', async () => {
    // Backward compatibility: every row in production has a null city today.
    const r = await resolver([
      { role_type: 'driver', context: null, city: null, rate_eur: 100 },
      { role_type: 'guide', context: 'day_tour', city: null, rate_eur: 200 },
    ])
    expect(r?.forCity('Cairo')).toBe(300)
    expect(r?.forCity(null)).toBe(300)
  })

  it('matches the city case- and whitespace-insensitively', async () => {
    const r = await resolver([{ role_type: 'driver', context: null, city: 'Aswan', rate_eur: 150 }])
    expect(r?.forCity('  aswan ')).toBe(150)
  })

  it('returns a hole, not a zero, when nothing applies to this city', async () => {
    // A city-only rate must not be charged elsewhere, and its absence must
    // read as "unpriced" rather than "free".
    const r = await resolver([{ role_type: 'driver', context: null, city: 'Aswan', rate_eur: 150 }])
    expect(r?.forCity('Cairo')).toBeNull()
  })
})
