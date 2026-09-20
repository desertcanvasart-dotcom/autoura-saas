// A day that says nothing is not a day that costs nothing.
//
// Found on live data, 2026-09-20. 27 of Sawa Tours' 48 template days were a
// title and a description and nothing else — no city, no sightseeing, no
// night. The engine had nothing to look up, so it recorded no gap, and nine
// full-day tours came out COMPLETE at 12.50 per person: the price of the
// lunch. Only a flag on the template kept that figure off the tours page.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, cairoTemplateRow, fullRateTables } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})
beforeEach(() => setMockTables({}))

// The live day, shortened: the title names no place the engine knows, and the
// programme is all in the prose.
const PROSE_DAY = {
  day: 1,
  title: ": Cairo's Treasures",
  description: '08:00 AM — pickup from your hotel. 09:00 AM — the three great pyramids…',
  meals: { breakfast: 'none', lunch: 'external', dinner: 'none' },
}

async function price(itinerary: Array<Record<string, unknown>>) {
  const tables = fullRateTables()
  const template = JSON.parse(JSON.stringify(cairoTemplateRow))
  template.itinerary = itinerary
  template.duration_days = itinerary.length
  tables.tour_templates = [template]
  setMockTables(tables)
  return calculateDayBasedPricing({
    templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard',
    isEurPassport: true, language: 'English', marginPercent: 25,
  })
}

describe('a day that is only a description', () => {
  it('is a gap, so a tour made of one is not a price', async () => {
    const result = await price([PROSE_DAY])
    expect(result.complete).toBe(false)
    const hole = result.holes.find(h => h.kind === 'template')
    expect(hole?.dayNumber).toBe(1)
    expect(hole?.message).toMatch(/only a description/)
    expect(hole?.message).toMatch(/Tour Manager/)
  })

  it('names each such day, not the tour as a whole', async () => {
    const result = await price([PROSE_DAY, { ...PROSE_DAY, day: 2 }])
    expect(result.holes.filter(h => h.kind === 'template').map(h => h.dayNumber)).toEqual([1, 2])
  })
})

describe('a day that says something is left alone', () => {
  const templateHoles = async (day: Record<string, unknown>) =>
    (await price([day])).holes.filter(h => h.kind === 'template')

  it('a city is enough — a free day at leisure is a real day', async () => {
    expect(await templateHoles({ ...PROSE_DAY, city: 'Cairo' })).toEqual([])
  })

  it('so is a stated services object, even one that asks for nothing', async () => {
    expect(await templateHoles({
      ...PROSE_DAY,
      services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false },
    })).toEqual([])
  })

  it('so is a title the engine can still read a visit from', async () => {
    // Guessing from the wording is a separate question the operator has kept
    // open on purpose; this guard does not settle it by the back door.
    expect(await templateHoles({ ...PROSE_DAY, title: 'Giza Pyramids and the Egyptian Museum' })).toEqual([])
  })
})
