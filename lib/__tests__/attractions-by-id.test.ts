import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, cairoTemplateRow, fullRateTables } from './fixtures/sample-templates'

// ============================================
// Attractions price by ID, wording through the alias table (A-item 13)
// ============================================
// The engine matched attractions by ilike substring with a hardcoded name
// map. The ported mechanism: a day carrying explicit attraction_ids prices
// THOSE fee rows and its wording is silenced; worded days resolve through
// the attraction_aliases table (combo canonicals split); a picked id that
// no longer resolves is a re-pick hole, never a guess; a 0-rate fee is a
// free visit, not a warning.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'

const BASE_PARAMS = {
  templateId: TEMPLATE_ID,
  tenantId: 'test-tenant',
  tier: 'standard' as const,
  isEurPassport: true,
  language: 'English',
  marginPercent: 25,
}

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

function withDay2(patch: Record<string, unknown>) {
  const tables = fullRateTables()
  const template = JSON.parse(JSON.stringify(cairoTemplateRow))
  template.itinerary[1] = { ...template.itinerary[1], ...patch }
  tables.tour_templates = [template]
  return tables
}

const entranceLines = (r: Awaited<ReturnType<typeof calculateDayBasedPricing>>) =>
  r.services.filter(s => s.serviceType === 'entrance')

describe('attraction_ids win and silence wording', () => {
  it('prices exactly the picked rows, ignoring the day wording', async () => {
    setMockTables(
      withDay2({
        // Wording says two attractions; the pick says ONLY the museum.
        attractions: ['Pyramids of Giza', 'Egyptian Museum'],
        attraction_ids: ['e-museum'],
      })
    )
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    const lines = entranceLines(r)
    expect(lines.map(l => l.serviceName)).toEqual(['Egyptian Museum'])
    expect(lines[0].unitCost).toBe(15)
    expect(r.complete).toBe(true)
  })

  it('a picked id that no longer resolves is a RE-PICK hole, never a guess', async () => {
    setMockTables(withDay2({ attraction_ids: ['e-deleted'] }))
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    expect(r.complete).toBe(false)
    const hole = r.holes.find(h => h.kind === 'entrance')
    expect(hole?.message).toMatch(/Re-pick/)
    expect(hole?.lookupAttempted).toContain('e-deleted')
  })

  it('a 0-rate picked fee is a free visit, not a warning', async () => {
    const tables = withDay2({ attraction_ids: ['e-free'] })
    ;(tables.entrance_fees as Array<Record<string, unknown>>).push({
      id: 'e-free',
      attraction_name: 'Colossi of Memnon',
      eur_rate: 0,
      non_eur_rate: 0,
      is_active: true,
    })
    setMockTables(tables)
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    const lines = entranceLines(r)
    expect(lines.map(l => l.serviceName)).toEqual(['Colossi of Memnon'])
    expect(lines[0].unitCost).toBe(0)
    expect(r.complete).toBe(true)
  })
})

describe('wording resolves through the alias table', () => {
  it('an alias row maps day wording to the canonical fee — including combos', async () => {
    const tables = withDay2({ attractions: ['Giza plateau'] })
    tables.attraction_aliases = [
      { alias: 'giza plateau', canonical: 'Pyramids of Giza + Egyptian Museum', tenant_id: null, is_active: true },
    ]
    setMockTables(tables)
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    expect(entranceLines(r).map(l => l.serviceName).sort()).toEqual([
      'Egyptian Museum',
      'Pyramids of Giza',
    ])
    expect(r.complete).toBe(true)
  })

  it('with no alias rows, exact names still price as before (no regression)', async () => {
    setMockTables(fullRateTables())
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    expect(entranceLines(r).map(l => l.serviceName).sort()).toEqual([
      'Egyptian Museum',
      'Pyramids of Giza',
    ])
    expect(r.complete).toBe(true)
  })
})
