// A sailing with fixed departure days warns when the itinerary boards on
// another day — priced, not blocked (the numbers are real), but a quote nobody
// can book must not look clean. Silent for a ship with no fixed day.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { fullRateTables, TEMPLATE_ID, cairoTemplateRow } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { calculateDayBasedPricing, clearVocabularyMemo } from '@/lib/auto-pricing-service'

const N = { breakfast: 'none', lunch: 'none', dinner: 'none' }
const S = { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false }
// Boards day 2 (in Luxor); three nights aboard.
const CRUISE = [
  { day: 1, title: 'Luxor', city: 'Luxor', meals: N, accommodation_type: 'hotel', services: S },
  { day: 2, title: 'Board', city: 'Luxor', meals: N, accommodation_type: 'cruise', services: S },
  { day: 3, title: 'Kom Ombo', city: 'Kom Ombo', meals: N, accommodation_type: 'cruise', services: S },
  { day: 4, title: 'Aswan', city: 'Aswan', meals: N, accommodation_type: 'cruise', services: S },
  { day: 5, title: 'Leave the ship', city: 'Aswan', meals: N, accommodation_type: 'hotel', services: S },
]

const ship = (over: Record<string, unknown> = {}) => ({
  id: 'ship1', ship_name: 'MS Test', tier: 'standard', embark_city: 'Luxor', disembark_city: 'Aswan',
  cabin_type: 'standard', ppd_eur: 120, single_supplement_eur: 0, triple_reduction_eur: 0,
  duration_nights: [3], is_active: true, seasons: null, ...over,
})

async function price(sailing_days: string[], travelDate: string) {
  const t = fullRateTables()
  t.tour_templates = [{ ...cairoTemplateRow, itinerary: CRUISE, duration_days: 5, tour_type: 'multi_day' }]
  t.nile_cruises = [ship({ sailing_days })]
  setMockTables(t)
  return calculateDayBasedPricing({
    templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard',
    isEurPassport: true, marginPercent: 0, travelDate,
  } as never)
}

const sailingWarn = (r: Awaited<ReturnType<typeof price>>) => r.warnings.find(w => w.includes('departs'))

describe('the sailing-days alarm', () => {
  beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key') })
  beforeEach(() => { clearVocabularyMemo(); setMockTables({}) })

  it('warns when the boarding day is not a sailing day', async () => {
    // travelDate 2026-11-10 → day 2 boards 2026-11-11, a Wednesday.
    const r = await price(['mon', 'fri'], '2026-11-10')
    expect(sailingWarn(r)).toContain('Mondays and Fridays')
    expect(sailingWarn(r)).toContain('boards on 2026-11-11')
  })

  it('is silent when the boarding day matches', async () => {
    // travelDate 2026-11-12 → day 2 boards 2026-11-13, a Friday.
    const r = await price(['mon', 'fri'], '2026-11-12')
    expect(sailingWarn(r)).toBeUndefined()
  })

  it('is silent when the ship has no fixed day', async () => {
    const r = await price([], '2026-11-10')
    expect(sailingWarn(r)).toBeUndefined()
  })
})
