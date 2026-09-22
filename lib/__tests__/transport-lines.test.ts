// A day's transport, as the operator sets it (sibling #454): the stored list,
// the engine following it, the preview that cannot disagree with pricing, the
// save rule and the sheet.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Papa from 'papaparse'
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { fullRateTables, TEMPLATE_ID, cairoTemplateRow } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { calculateDayBasedPricing, parseItinerary, extraTransfersFor, previewDayTransport, clearVocabularyMemo } from '@/lib/auto-pricing-service'
import { sanitizeTransportLines, transportLinesToCell, transportLinesFromCell } from '@/lib/pricing/transport-lines'
import { applyDayForm, type DayForm } from '@/lib/tours/day-edit'
import { parseDaysCsv, serializeDaysCsv } from '@/lib/tours/itinerary-csv'

const N = { breakfast: 'none', lunch: 'none', dinner: 'none' }
const papa = (csv: string) => Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }) as never

describe('the stored list', () => {
  it('cleans what it is given; not a list = not set; empty = no transport', () => {
    expect(sanitizeTransportLines(undefined)).toBeUndefined()
    expect(sanitizeTransportLines('x')).toBeUndefined()
    expect(sanitizeTransportLines([])).toEqual([])
    expect(sanitizeTransportLines([{ service_type: ' Day Tour ', city: '  Luxor ' }, { service_type: 'intercity_dropoff', from: 'Luxor', to: 'Aswan', city: 'ignored' }, { junk: 1 }, null]))
      .toEqual([{ service_type: 'day_tour', city: 'Luxor' }, { service_type: 'intercity_dropoff', from: 'Luxor', to: 'Aswan' }])
  })
  it('the sheet cell round-trips', () => {
    const lines = [{ service_type: 'day_tour', city: 'Luxor' }, { service_type: 'intercity_dropoff', from: 'Luxor', to: 'Aswan' }, { service_type: 'sound_light' }]
    const cell = transportLinesToCell(lines)
    expect(cell).toBe('day_tour@Luxor; intercity_dropoff:Luxor>Aswan; sound_light')
    expect(transportLinesFromCell(cell)).toEqual(lines)
    expect(transportLinesToCell([])).toBe('none'); expect(transportLinesFromCell('none')).toEqual([])
    expect(transportLinesToCell(undefined)).toBe(''); expect(transportLinesFromCell('')).toBeUndefined()
  })
})

describe('the engine follows the list', () => {
  const days = (over: Record<string, unknown>) => parseItinerary([
    { day: 1, city: 'Cairo', meals: N, accommodation_type: 'hotel', attractions: ['Giza Plateau'] },
    { day: 2, city: 'Luxor', meals: N, accommodation_type: 'hotel', attractions: ['Karnak Temple'], meals_: 0, ...over },
  ])
  it('absent: the rules — a road drop-off on the city change, and the dinner transfer', () => {
    const d = days({ meals: { ...N, dinner: 'external' } })
    expect(d[1].transport_lines).toBeUndefined()
    expect(extraTransfersFor(d[1], d[0], null).map(e => e.slug)).toEqual(['dinner-transfer'])
  })
  it('present: exactly those lines — the derived dinner transfer is NOT added beside them', () => {
    const d = days({ meals: { ...N, dinner: 'external' }, transport_lines: [{ service_type: 'half_day' }, { service_type: 'intercity_dropoff', from: 'Cairo', to: 'Luxor' }] })
    const extras = extraTransfersFor(d[1], d[0], null)
    expect(extras.map(e => `${e.serviceType}@${e.city}${e.originCity ? ` ${e.originCity}→${e.destinationCity}` : ''}`)).toEqual(['half_day@Luxor', 'intercity_dropoff@Luxor Cairo→Luxor'])
  })
  it('a road line with no route runs yesterday → today', () => {
    const d = days({ transport_lines: [{ service_type: 'intercity_dropoff' }] })
    expect(extraTransfersFor(d[1], d[0], null)[0]).toMatchObject({ originCity: 'Cairo', destinationCity: 'Luxor' })
  })
  it('empty: no transport that day', () => {
    expect(extraTransfersFor(days({ transport_lines: [] })[1], null, null)).toEqual([])
  })
})

describe('priced, and previewed the same way', () => {
  beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key') })
  beforeEach(() => { clearVocabularyMemo(); setMockTables({}) })
  // Every vehicle size: pricing runs for several group sizes, and a size with
  // no rate would be a gap of its own.
  const RATES = ['Sedan', 'Minivan', 'Van', 'Minibus', 'Bus'].flatMap(vehicle_type => [
    { id: `dt-${vehicle_type}`, service_code: 'DT', service_type: 'day_tour', vehicle_type, city: 'Cairo', base_rate_eur: 40, base_rate_non_eur: 40, is_active: true },
    { id: `hd-${vehicle_type}`, service_code: 'HD', service_type: 'half_day', vehicle_type, city: 'Cairo', base_rate_eur: 25, base_rate_non_eur: 25, is_active: true },
    { id: `sl-${vehicle_type}`, service_code: 'SL', service_type: 'sound_light', vehicle_type, city: 'Cairo', base_rate_eur: 15, base_rate_non_eur: 15, is_active: true },
  ])
  const ITIN = (over: Record<string, unknown>) => [
    { day: 1, title: 'Arrive', city: 'Cairo', meals: N, accommodation_type: 'hotel', services: { airport_arrival: false, guide_required: false } },
    { day: 2, title: 'Pyramids', city: 'Cairo', meals: N, accommodation_type: 'hotel', attractions: ['Giza Plateau'], ...over },
    { day: 3, title: 'Home', city: 'Cairo', meals: N, services: { airport_departure: false, guide_required: false } },
  ]
  const price = async (over: Record<string, unknown>) => {
    const t = fullRateTables(); t.tour_templates = [{ ...cairoTemplateRow, itinerary: ITIN(over) }]; t.transportation_rates = RATES; setMockTables(t)
    return calculateDayBasedPricing({ templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard', isEurPassport: true, language: 'English', marginPercent: 0 } as never)
  }
  const transport = (r: Awaited<ReturnType<typeof price>>) => r.services.filter(s => s.serviceType === 'transportation' && s.dayNumber === 2 && !/no rate/i.test(s.serviceName)).map(s => `${s.serviceName} = ${s.unitCost}`)

  it('by the rules the pyramids day is a day tour at 40; with its own list it is a half day and the sound & light — 25 + 15', async () => {
    expect(transport(await price({}))).toEqual(['Sedan - Cairo = 40'])
    const own = await price({ transport_lines: [{ service_type: 'half_day' }, { service_type: 'sound_light' }] })
    expect(transport(own).sort()).toEqual(['half day - Cairo = 25', 'sound light - Cairo = 15'])
    expect(own.holes.filter(h => h.kind === 'transport' && h.dayNumber === 2)).toEqual([])
  })
  it('a listed line with no rate is a gap that names it', async () => {
    const r = await price({ transport_lines: [{ service_type: 'long_day_tour' }] })
    expect(transport(r)).toEqual([])
    // …and, as every gap is, listed in its day as a 0 line that says so.
    expect(r.services.some(s => s.dayNumber === 2 && /no rate/i.test(s.serviceName) && s.unitCost === 0)).toBe(true)
    expect(r.holes.some(h => h.kind === 'transport' && h.dayNumber === 2 && /long_day_tour/.test(h.lookupAttempted))).toBe(true)
  })
  it('an empty list removes the vehicle, and no gap is recorded for it', async () => {
    const r = await price({ transport_lines: [] })
    expect(transport(r)).toEqual([])
    expect(r.holes.filter(h => h.kind === 'transport' && h.dayNumber === 2)).toEqual([])
  })
  it('the preview shows the same lines and costs, derived or listed', async () => {
    setMockTables({ transportation_rates: RATES })
    const auto = await previewDayTransport({ tenantId: 'test-tenant' }, ITIN({}), { pax: 2 })
    expect(auto[1]).toMatchObject({ day: 2, automatic: true })
    expect(auto[1].lines.map(l => `${l.serviceType} ${l.cost} ${l.derived}`)).toEqual(['day_tour 40 true'])
    const own = await previewDayTransport({ tenantId: 'test-tenant' }, ITIN({ transport_lines: [{ service_type: 'half_day' }, { service_type: 'long_day_tour' }] }), { pax: 2 })
    expect(own[1].automatic).toBe(false)
    expect(own[1].lines.map(l => `${l.serviceType} ${l.cost}`)).toEqual(['half_day 25', 'long_day_tour null'])
    expect(own[1].lines[1].reason).toMatch(/No Sedan rate for long day tour in Cairo/)
  })
  it('the preview runs the engine’s own steps — nothing in it is a second opinion', () => {
    const engine = readFileSync(join(process.cwd(), 'lib/auto-pricing-service.ts'), 'utf8')
    const body = engine.slice(engine.indexOf('export async function previewDayTransport'), engine.indexOf('/** What a transport lookup outside the engine found. */'))
    for (const fn of ['parseItinerary(', 'determineTransportNeeds(', 'extraTransfersFor(', 'findTransportRate(', 'getVehicleTypeByPax(']) expect(body).toContain(fn)
    expect(readFileSync(join(process.cwd(), 'app/api/tours/transport-preview/route.ts'), 'utf8')).toContain('previewDayTransport(')
  })
})

describe('saved, and round-tripped', () => {
  const FORM: DayForm = { title: 'Day', description: '', meals: {}, picked: [], transportType: '', transportRateId: '', city: 'Cairo', night: '', cityTransfer: false, length: '', propertiesByTier: {}, noSightseeing: false }
  it('the editor stores the list only when set; Reset removes it', () => {
    expect(applyDayForm(null, { ...FORM, transportLines: [{ service_type: 'half_day' }] }, 1).transport_lines).toEqual([{ service_type: 'half_day' }])
    expect(applyDayForm(null, { ...FORM, transportLines: [] }, 1).transport_lines).toEqual([])
    expect(applyDayForm({ day: 1, transport_lines: [{ service_type: 'half_day' }] }, FORM, 1).transport_lines).toBeUndefined()
  })
  it('the days sheet carries it; blank stays automatic', () => {
    const tour = [{ template_code: 'T', itinerary: [
      { day: 1, title: 'A', city: 'Cairo', meals: N, transport_lines: [{ service_type: 'half_day' }, { service_type: 'intercity_dropoff', from: 'Cairo', to: 'Luxor' }], services: { guide_required: true } },
      { day: 2, title: 'B', city: 'Luxor', meals: N, transport_lines: [], services: { guide_required: true } },
      { day: 3, title: 'C', city: 'Luxor', meals: N, services: { guide_required: true } },
    ] }]
    const parsed = parseDaysCsv(serializeDaysCsv(tour), papa)
    expect(parsed.refused).toEqual([])
    const [a, b, c] = parsed.byTemplate.get('T')! as Array<Record<string, unknown>>
    expect(a.transport_lines).toEqual([{ service_type: 'half_day' }, { service_type: 'intercity_dropoff', from: 'Cairo', to: 'Luxor' }])
    expect(b.transport_lines).toEqual([])
    expect(c.transport_lines).toBeUndefined()
  })
  it('the editor lists the day’s transport, lets it be changed, and offers Reset to automatic', () => {
    const page = readFileSync(join(process.cwd(), 'app/tours/manage/TourManagerContent.tsx'), 'utf8')
    for (const s of ['Transport this day', 'Changed on this day', 'Reset to automatic', '+ Add a line', "fetch('/api/tours/transport-preview'"]) expect(page).toContain(s)
  })
})
