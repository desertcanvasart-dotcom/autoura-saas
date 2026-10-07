// A day trip — sightseeing in Alexandria, the night back at the Cairo hotel
// (live ITN-S-2026-8987). A day had one city, so the engine read Alexandria as
// where the party slept: a one-way drop-off there, a hotel looked for in
// Alexandria, and a second drop-off back to Cairo the next day. The day editor
// now says "day trip from Cairo" (lib/pricing/day-trip).
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { fullRateTables, TEMPLATE_ID, cairoTemplateRow } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { calculateDayBasedPricing, parseItinerary, determineTransportNeeds, previewDayTransport, clearVocabularyMemo } from '@/lib/auto-pricing-service'
import { roadShapeAt } from '@/lib/pricing/road-trips'
import { dayTripFrom, dayTripFromItineraryDay } from '@/lib/pricing/day-trip'
import { applyDayForm } from '@/lib/tours/day-edit'

const N = { breakfast: 'none', lunch: 'none', dinner: 'none' }
const S = { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false }
const TRIP = [
  { day: 1, title: 'Cairo', city: 'Cairo', meals: N, accommodation_type: 'hotel', services: S },
  { day: 2, title: 'Alexandria day trip', city: 'Alexandria', day_trip_from: 'Cairo', attractions: ["Pompey's Pillar"], meals: N, accommodation_type: 'hotel', services: S },
  { day: 3, title: 'Cairo', city: 'Cairo', meals: N, accommodation_type: 'hotel', services: S },
  { day: 4, title: 'Cairo', city: 'Cairo', meals: N, services: S },
]

describe('which days are day trips', () => {
  it('a road day whose stay is somewhere else', () => {
    expect(dayTripFrom({ city: 'Alexandria', day_trip_from: ' Cairo ' })).toBe('Cairo')
  })
  it('not when the stay is the same city, unset, or the day moves by its own rules', () => {
    expect(dayTripFrom({ city: 'Cairo', day_trip_from: 'cairo' })).toBeNull()
    expect(dayTripFrom({ city: 'Alexandria' })).toBeNull()
    expect(dayTripFrom({ city: 'Luxor', day_trip_from: 'Cairo', transport_type: 'flight' })).toBeNull()
    expect(dayTripFrom({ city: 'Aswan', day_trip_from: 'Luxor', accommodation_type: 'cruise' })).toBeNull()
    expect(dayTripFrom({ city: '', day_trip_from: 'Cairo' })).toBeNull()
  })
})

describe('the engine reads a day trip as based where the party stays', () => {
  const days = parseItinerary(TRIP)

  it('files the day under the stay, with the sightseeing city beside it', () => {
    expect(days[1]).toMatchObject({ city: 'Cairo', day_trip_to: 'Alexandria', accommodation_type: 'hotel' })
    expect(days[0].day_trip_to).toBeUndefined()
  })

  it('asks for the Intercity Day Trip, stay → sightseeing city — and no road move either side', () => {
    expect(determineTransportNeeds(days[1], days[0], days[2], roadShapeAt(days, 1))).toMatchObject({
      serviceType: 'intercity_day_trip', originCity: 'Cairo', destinationCity: 'Alexandria',
    })
    expect(roadShapeAt(days, 1)).toBeNull()
    expect(roadShapeAt(days, 2)).toBeNull()
    expect(determineTransportNeeds(days[2], days[1], days[3], roadShapeAt(days, 2)).serviceType).toBe('day_tour')
  })

  it('without the field, as before: Alexandria is a city the party moves to', () => {
    const plain = parseItinerary(TRIP.map(d => ({ ...d, day_trip_from: undefined })))
    expect(plain[1].city).toBe('Alexandria')
    expect(roadShapeAt(plain, 1)?.kind).toBe('overnight_return')
  })
})

describe('priced', () => {
  beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key') })
  beforeEach(() => { clearVocabularyMemo(); setMockTables({}) })
  const route = (service_type: string, city: string, destination_city: string | null, rate: number) =>
    ['Sedan', 'Minivan', 'Van', 'Minibus', 'Bus'].map(vehicle_type => ({ id: `${service_type}-${city}-${destination_city}-${vehicle_type}`, service_code: 'R', service_type, vehicle_type, city, destination_city, origin_city: null, base_rate_eur: rate, base_rate_non_eur: rate, is_active: true }))
  const price = async (rates: unknown[]) => {
    const t = fullRateTables(); t.tour_templates = [{ ...cairoTemplateRow, itinerary: TRIP, duration_days: 4, tour_type: 'multi_day' }]; t.transportation_rates = rates; setMockTables(t)
    return calculateDayBasedPricing({ templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard', isEurPassport: true, language: 'English', marginPercent: 0 } as never)
  }

  it('at the Intercity Day Trip rate, with the night in the Cairo hotel — the overnight and drop-off rates unused', async () => {
    const r = await price([
      ...route('intercity_day_trip', 'Cairo', 'Alexandria', 120),
      ...route('intercity_overnight', 'Cairo', 'Alexandria', 190),
      ...route('intercity_dropoff', 'Cairo', 'Alexandria', 100),
      ...route('day_tour', 'Alexandria', null, 50),
    ])
    const day2 = r.services.filter(s => s.dayNumber === 2)
    expect(day2.filter(s => s.serviceType === 'transportation').map(s => s.unitCost)).toEqual([120])
    expect(day2.find(s => s.serviceType === 'accommodation')?.serviceName).toMatch(/\(Cairo\)/)
    expect(r.holes.filter(h => h.kind === 'transport' && h.dayNumber === 2)).toEqual([])
    // Nothing is charged for a road back to Cairo on day 3.
    expect(r.services.some(s => s.dayNumber === 3 && /Alexandria/.test(s.serviceName))).toBe(false)
  })

  it('no day-trip rate for that road: a gap naming it — never the overnight or a tour inside Alexandria', async () => {
    const r = await price([...route('intercity_overnight', 'Cairo', 'Alexandria', 190), ...route('day_tour', 'Alexandria', null, 50)])
    expect(r.services.some(s => s.dayNumber === 2 && s.serviceType === 'transportation' && (s.unitCost === 190 || s.unitCost === 50))).toBe(false)
    expect(r.holes.some(h => h.dayNumber === 2 && /No intercity day trip rate for Sedan Cairo → Alexandria/.test(h.message))).toBe(true)
  })

  it('the editor’s preview shows the same line', async () => {
    setMockTables({ transportation_rates: route('intercity_day_trip', 'Cairo', 'Alexandria', 120) })
    const p = await previewDayTransport({ tenantId: 'test-tenant' }, TRIP, { pax: 2 })
    expect(p[1].lines.map(l => `${l.serviceType} ${l.cost} ${l.label}`)).toEqual(['intercity_day_trip 120 intercity day trip Cairo → Alexandria and back'])
  })
})

describe('the day editor stores it', () => {
  const form = (dayTripFrom: string) => ({
    title: 'Alexandria', description: '', meals: N, picked: [], activityIds: [], transportType: '', transportRateId: '',
    city: 'Alexandria', night: 'hotel', cityTransfer: false, length: '', propertiesByTier: {}, noSightseeing: false, dayTripFrom,
  })
  it('as day_trip_from, and drops it when cleared', () => {
    expect(applyDayForm(null, form('Cairo'), 2).day_trip_from).toBe('Cairo')
    expect(applyDayForm({ day_trip_from: 'Cairo' }, form(''), 2)).not.toHaveProperty('day_trip_from')
  })
})

describe('an itinerary turned into a tour template', () => {
  it('a day whose night is in another city is a day trip from there', () => {
    expect(dayTripFromItineraryDay({ city: 'Alexandria', overnight_city: 'Cairo' }, 'hotel')).toBe('Cairo')
  })
  it('not a move, a ship, a last day without a hotel, or a night in the same city', () => {
    expect(dayTripFromItineraryDay({ city: 'Luxor', overnight_city: 'Cairo', intercity: 'road' }, 'hotel')).toBeNull()
    expect(dayTripFromItineraryDay({ city: 'Aswan', overnight_city: 'On board MS Nile', is_cruise_day: true }, 'cruise')).toBeNull()
    expect(dayTripFromItineraryDay({ city: 'Alexandria', overnight_city: 'Cairo' }, 'none')).toBeNull()
    expect(dayTripFromItineraryDay({ city: 'Cairo', overnight_city: 'Cairo' }, 'hotel')).toBeNull()
    expect(dayTripFromItineraryDay({ city: 'Cairo', overnight_city: null }, 'hotel')).toBeNull()
    // A hotel next door is the same city for a vehicle.
    expect(dayTripFromItineraryDay({ city: 'Cairo', overnight_city: 'Giza' }, 'hotel')).toBeNull()
  })
})
