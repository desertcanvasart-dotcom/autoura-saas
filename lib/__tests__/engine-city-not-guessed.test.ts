// A day the wording cannot place must not be priced as Cairo.
//
// inferCityFromTitle ended in `return 'Cairo'  // Default`, so "Leisure day",
// "Free morning at your own pace", a city not in its short list, or a title
// written in another language was priced with CAIRO's hotel — a real rate for
// the wrong place, with nothing to notice. The live templates store no city at
// all, so every city in them is read out of a title.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, cairoTemplateRow, fullRateTables } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateDayBasedPricing, parseItinerary } from '@/lib/auto-pricing-service'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})
beforeEach(() => setMockTables({}))

const cityOf = (title: string) => parseItinerary([{ day: 1, title }])[0].city

describe('the city a day is priced in', () => {
  it('is read from the title when the title says one', () => {
    expect(cityOf('Pyramids and the Sphinx')).toBe('Cairo')
    expect(cityOf('Valley of the Kings')).toBe('Luxor')
    expect(cityOf('Philae Temple and the High Dam')).toBe('Aswan')
    expect(cityOf('Leisure in Hurghada')).toBe('Hurghada')
  })

  it('is the city stored on the day, whatever the title says', () => {
    expect(parseItinerary([{ day: 1, title: 'Pyramids', city: 'Alexandria' }])[0].city).toBe('Alexandria')
  })

  it('is empty when nothing says where the day is — not Cairo', () => {
    for (const title of ['Leisure day', 'Free morning at your own pace', 'Day at leisure', 'Departure', 'Marsa Alam beach day', '']) {
      expect(cityOf(title), title).toBe('')
    }
  })
})

describe('a night in a day with no city', () => {
  it('is a hole naming the day, and no hotel is priced', async () => {
    const tables = fullRateTables()
    const template = JSON.parse(JSON.stringify(cairoTemplateRow))
    template.itinerary[1].title = 'Day at leisure'
    delete template.itinerary[1].city
    tables.tour_templates = [template]
    setMockTables(tables)

    const result = await calculateDayBasedPricing({
      templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard',
      isEurPassport: true, language: 'English', marginPercent: 25,
    })

    expect(result.complete).toBe(false)
    const hole = result.holes.find(h => h.kind === 'hotel' && h.message.includes('names no city'))
    expect(hole?.message).toContain('Day 2')

    // The Cairo hotel is priced for the days that DO say Cairo, and not for
    // the one that says nothing — no silent Cairo night.
    const hotelLines = result.services.filter(s => s.serviceType === 'accommodation')
    expect(hotelLines.map(l => l.dayNumber)).not.toContain(2)
  })

  it('does not stop the rest of the trip pricing', async () => {
    const tables = fullRateTables()
    const template = JSON.parse(JSON.stringify(cairoTemplateRow))
    template.itinerary[1].title = 'Day at leisure'
    delete template.itinerary[1].city
    tables.tour_templates = [template]
    setMockTables(tables)

    const result = await calculateDayBasedPricing({
      templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard',
      isEurPassport: true, language: 'English', marginPercent: 25,
    })
    expect(result.services.some(s => s.serviceType === 'accommodation')).toBe(true)
  })

  it('reports the days once, together', async () => {
    const tables = fullRateTables()
    const template = JSON.parse(JSON.stringify(cairoTemplateRow))
    for (const i of [0, 1]) {
      template.itinerary[i].title = 'Day at leisure'
      delete template.itinerary[i].city
    }
    tables.tour_templates = [template]
    setMockTables(tables)

    const result = await calculateDayBasedPricing({
      templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard',
      isEurPassport: true, language: 'English', marginPercent: 25,
    })
    const holes = result.holes.filter(h => h.message.includes('names no city'))
    expect(holes).toHaveLength(1)
    expect(holes[0].message).toContain('Day 1, 2')
  })
})
