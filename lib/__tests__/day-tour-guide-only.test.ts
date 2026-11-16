// A car & guide day tour (operator, 2026-11-16): car, guide, water and the
// driver's tip; no fixed route, so no entrance fees — and no gap for them.
import { vi, describe, it, expect, beforeAll } from 'vitest'
import Papa from 'papaparse'
import { sightseeingStatement, dayTourNamesNoAttractions } from '@/lib/tours/day-sightseeing'
import { parseDaysCsv } from '@/lib/tours/itinerary-csv'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { fullRateTables } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'

describe('the rule', () => {
  it('guide_only is a stated, guided day that names no sights on purpose', () => {
    expect(sightseeingStatement({ sightseeing: 'guide_only' })).toBe('guided')
    expect(dayTourNamesNoAttractions({ sightseeing: 'guide_only' })).toBe(false)
    expect(dayTourNamesNoAttractions({ attractions: [] })).toBe(true)
  })
})

describe('the days sheet', () => {
  const parse = (csv: string) => { const p = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }); return { data: p.data, errors: [] } }
  const head = 'Template Code,Day,Title,City,Accommodation,Breakfast,Lunch,Dinner,Attractions,Guide,Sightseeing\n'
  it('reads guide_only', () => {
    const d = parseDaysCsv(head + 'CG,1,Car & guide,Cairo,none,none,none,none,,true,guide_only\n', parse)
    expect(d.refused).toEqual([])
    expect(d.byTemplate.get('CG')?.[0]).toMatchObject({ sightseeing: 'guide_only' })
  })
  it('refuses guide_only beside attractions', () => {
    const d = parseDaysCsv(head + 'CG,1,Car & guide,Cairo,none,none,none,none,Karnak Temple,true,guide_only\n', parse)
    expect(d.refused.length).toBe(1)
  })
})

describe('through the engine', () => {
  beforeAll(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
  })
  const run = async (sightseeing?: string) => {
    const tables = fullRateTables()
    tables.tour_templates = [{
      id: 'cg-1', template_name: 'Car & guide', template_code: 'CG', duration_days: 1, tour_type: 'day_tour',
      itinerary: [{ day: 1, title: 'Car & guide in Cairo', city: 'Cairo', accommodation_type: 'none',
        meals: { breakfast: 'none', lunch: 'none', dinner: 'none' }, attractions: [], ...(sightseeing ? { sightseeing } : {}) }],
    }]
    setMockTables(tables)
    return calculateDayBasedPricing({ templateId: 'cg-1', tenantId: 'test-tenant', tier: 'standard', isEurPassport: true, language: 'English', marginPercent: 25 })
  }
  it('prices the guide and the car, sells no ticket, and records no entrance gap', async () => {
    const r = await run('guide_only')
    expect(r.services.some(s => s.serviceType === 'guide' && s.lineTotal > 0)).toBe(true)
    expect(r.services.some(s => s.serviceType === 'transportation' && s.lineTotal > 0)).toBe(true)
    expect(r.services.some(s => s.serviceType === 'entrance')).toBe(false)
    expect(r.holes.some(h => h.kind === 'entrance')).toBe(false)
  })
  it('without it, a day tour naming no sight still has its gap', async () => {
    const r = await run()
    expect(r.holes.some(h => h.kind === 'entrance')).toBe(true)
  })
})

describe('the day editor keeps it', () => {
  it('a save keeps guide_only while the day names no sight, and drops it once one is picked', async () => {
    const { applyDayForm } = await import('@/lib/tours/day-edit')
    const day = { day: 1, title: 'Car & guide', city: 'Cairo', accommodation_type: 'none', meals: { breakfast: 'none', lunch: 'none', dinner: 'none' }, attractions: [], sightseeing: 'guide_only' }
    const form = { title: day.title, description: '', meals: { ...day.meals }, picked: [], transportType: '', transportRateId: '', city: 'Cairo', night: 'none', cityTransfer: false, length: '', propertiesByTier: {}, noSightseeing: false, activityIds: [] }
    expect(applyDayForm(day as never, form as never, 1).sightseeing).toBe('guide_only')
    const withSight = applyDayForm({ ...day, attractions: ['Karnak Temple'] } as never, form as never, 1)
    expect(withSight.sightseeing).toBeUndefined()
  })
})
