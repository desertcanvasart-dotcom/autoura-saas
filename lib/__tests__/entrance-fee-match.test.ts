// Which entrance fee a wording means.
//
// Found on live data, 2026-09-20: the lookup was `ILIKE '%wording%' LIMIT 1`
// with no ORDER BY, reported as DEFINITE. In all five agencies' sheets
// "Egyptian Museum" also matches "The Grand Egyptian Museum (GEM)" — 1,640 EGP
// instead of 600 — and which one a quote got was up to the database.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, cairoTemplateRow, fullRateTables } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateDayBasedPricing, getEntranceFee } from '@/lib/auto-pricing-service'
import { chooseEntranceFee, ambiguousFeeMessage } from '@/lib/pricing/entrance-fee-match'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})
beforeEach(() => setMockTables({}))

// The live names and prices (EGP), as every sheet has them.
const fee = (attraction_name: string, eur_rate: number) => ({ attraction_name, eur_rate })
const MUSEUMS = [fee('The Grand Egyptian Museum (GEM)', 1640), fee('Egyptian Museum', 600)]
const SAQQARA = [fee('Serapeum of Saqqara', 300), fee('Saqqara Monuments', 650), fee('Saqqara', 600)]

describe('the rule', () => {
  it('a fee whose name IS the wording wins — whatever order the rows come in', () => {
    for (const rows of [MUSEUMS, [...MUSEUMS].reverse()]) {
      const c = chooseEntranceFee(rows, 'Egyptian Museum')
      expect(c.kind === 'one' && c.row.eur_rate).toBe(600)
    }
    const s = chooseEntranceFee(SAQQARA, 'saqqara ')
    expect(s.kind === 'one' && s.row.attraction_name).toBe('Saqqara')
  })

  it('the only fee containing the wording is still that fee', () => {
    const c = chooseEntranceFee([fee('Karnak Temple', 600)], 'Karnak')
    expect(c.kind === 'one' && c.row.attraction_name).toBe('Karnak Temple')
  })

  it('several that contain it and none that IS it: a named gap, never the first row', () => {
    const c = chooseEntranceFee([fee('Abu Simbel Temple', 822), fee('Abu Simbel Sound & Light', 500)], 'Abu Simbel')
    expect(c.kind).toBe('ambiguous')
    if (c.kind !== 'ambiguous') return
    expect(c.ambiguity.count).toBe(2)
    expect(c.ambiguity.names).toEqual(['Abu Simbel Temple', 'Abu Simbel Sound & Light'])
    const message = ambiguousFeeMessage('Abu Simbel', c.ambiguity)
    expect(message).toContain('fits 2 entrance fees')
    expect(message).toContain('"Abu Simbel Sound & Light"')
    expect(message).toMatch(/Pick the fee on the day/)
  })

  it('two fees with the SAME name are not settled by taking the first either', () => {
    const c = chooseEntranceFee([fee('Philae Temple', 450), fee('philae temple', 500)], 'Philae Temple')
    expect(c.kind).toBe('ambiguous')
    if (c.kind === 'ambiguous') expect(ambiguousFeeMessage('Philae Temple', c.ambiguity)).toMatch(/all named "Philae Temple"/)
  })

  it('nothing, a blank, and rows that do not contain the wording are all "none"', () => {
    expect(chooseEntranceFee([], 'Karnak').kind).toBe('none')
    expect(chooseEntranceFee(MUSEUMS, '  ').kind).toBe('none')
    // A caller cannot widen the rule by handing over too much.
    expect(chooseEntranceFee(MUSEUMS, 'Karnak').kind).toBe('none')
  })
})

const row = (id: string, attraction_name: string, eur_rate: number) => ({
  id, attraction_name, eur_rate, non_eur_rate: eur_rate, city: 'Cairo', is_active: true, rate_currency: 'EUR',
})
const scope = { tenantId: 'test-tenant' } as never

describe('the lookup the engine and both B2B routes share', () => {
  it('prices the Egyptian Museum as the Egyptian Museum', async () => {
    // GEM first, which is the order that used to win.
    setMockTables({ entrance_fees: [row('gem', 'The Grand Egyptian Museum (GEM)', 30), row('em', 'Egyptian Museum', 11)] })
    const found = await getEntranceFee(scope, 'Egyptian Museum', true)
    expect(found).toMatchObject({ id: 'em', rate: 11, source: 'db' })
    expect(found?.ambiguous).toBeUndefined()
  })

  it('…and does not depend on the right fee happening to sort first', async () => {
    // Alphabetical order rescues "Egyptian Museum" by luck. Here it does not.
    setMockTables({ entrance_fees: [row('aswan', 'Aswan Annex of the Nubia Museum', 9), row('nubia', 'Nubia Museum', 4)] })
    expect(await getEntranceFee(scope, 'Nubia Museum', true)).toMatchObject({ id: 'nubia', rate: 4, source: 'db' })
  })

  it('an ambiguous wording comes back as NOT a price, under the old contract too', async () => {
    setMockTables({ entrance_fees: [row('t', 'Abu Simbel Temple', 15), row('sl', 'Abu Simbel Sound & Light', 9)] })
    const found = await getEntranceFee(scope, 'Abu Simbel', true)
    // A caller that only knows `source === 'db'` means usable still refuses it.
    expect(found?.source).not.toBe('db')
    expect(found?.ambiguous?.count).toBe(2)
  })
})

describe('the engine', () => {
  async function priceDay2(attractions: string[], fees: Array<Record<string, unknown>>) {
    const tables = fullRateTables()
    tables.entrance_fees = fees
    const template = JSON.parse(JSON.stringify(cairoTemplateRow))
    Object.assign(template.itinerary[1], { attractions, attraction_ids: [] })
    tables.tour_templates = [template]
    setMockTables(tables)
    return calculateDayBasedPricing({
      templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard',
      isEurPassport: true, language: 'English', marginPercent: 25,
    })
  }

  it('lists the right museum at the right price', async () => {
    const result = await priceDay2(['Egyptian Museum'], [row('gem', 'The Grand Egyptian Museum (GEM)', 30), row('em', 'Egyptian Museum', 11)])
    const line = result.services.find(s => s.serviceType === 'entrance' && s.dayNumber === 2 && !s.unpriced)
    expect(line).toMatchObject({ id: 'entrance-em', unitCost: 11, serviceName: 'Egyptian Museum' })
  })

  it('records an ambiguous wording as a gap that names the candidates', async () => {
    const result = await priceDay2(['Abu Simbel'], [row('t', 'Abu Simbel Temple', 15), row('sl', 'Abu Simbel Sound & Light', 9)])
    const hole = result.holes.find(h => h.kind === 'entrance' && h.attraction === 'Abu Simbel')
    expect(hole?.message).toContain('fits 2 entrance fees')
    expect(result.services.some(s => s.serviceType === 'entrance' && !s.unpriced && /Abu Simbel/.test(s.serviceName))).toBe(false)
  })
})

describe('the two B2B paths take only a definite fee', () => {
  it('the calculator\'s wrapper no longer drops the source', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/b2b/calculate-price/route.ts'), 'utf8')
    const wrapper = src.slice(src.indexOf('async function getEntranceFee('), src.indexOf('// Get hotel rate from hotel_contacts'))
    expect(wrapper).toMatch(/if \(!fee \|\| fee\.source !== 'db'\) return null/)
  })

  it('quote-from-itinerary refuses a keyword or ambiguous match, and says why', async () => {
    const { repriceItineraryServices } = await import('@/lib/b2b/quote-from-itinerary-pricing')
    const days = [{ day_number: 1, itinerary_services: [{ id: 's1', service_type: 'entrance', service_name: 'Citadel of Saladin', quantity: 1 }] }]
    const ctx = { tier: 'standard', numPax: 2, isEurPassport: true, currencySymbol: 'EGP ', tourLeaderIncluded: false }
    const lookups = (entrance: unknown) => ({
      hotel: async () => null, cruise: async () => null, meals: async () => null, guide: async () => null,
      tieredActivity: async () => null, entrance: async () => entrance,
    })
    // The keyword fallback: "citadel" found Qaitbay. It used to be priced.
    const keyword = await repriceItineraryServices(days as never, ctx as never, lookups({ rate: 7, source: 'fuzzy' }) as never)
    expect(keyword.holes.map(h => h.kind)).toContain('entrance')
    const ambiguous = await repriceItineraryServices(days as never, ctx as never,
      lookups({ rate: 0, source: 'fuzzy', ambiguous: { count: 2, names: ['Salah Eldin Citadel', 'Qaitbay Citadel'], preferredCount: 0 } }) as never)
    expect(ambiguous.holes.find(h => h.kind === 'entrance')?.message).toContain('fits 2 entrance fees')
    // And a definite one is still a price.
    const definite = await repriceItineraryServices(days as never, ctx as never, lookups({ rate: 12, source: 'db' }) as never)
    expect(definite.holes.filter(h => h.kind === 'entrance')).toEqual([])
  })
})
