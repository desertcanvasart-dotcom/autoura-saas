// Supplier documents for a trip (lib/documents/plan-supplier-documents), on
// live ITN-S-2026-8987 as saved by the Pricing Grid: Cairo, Giza, an
// Alexandria day trip from the Cairo hotel, Cairo. It came out as a hotel
// voucher checking out on its last night, the airport meet & assist on the
// driver's voucher, and — after the trip was saved again — no Cairo meals,
// entrance-fee or guide document, with nothing saying so.
import { describe, it, expect } from 'vitest'
import { planSupplierDocuments, dayAfter, type PlanDay } from '@/lib/documents/plan-supplier-documents'

const line = (service_type: string, service_name: string, slot?: string) => ({
  service_type,
  service_name,
  description: slot ? `[pricing-grid:${slot}] ${service_name}` : null,
  supplier_id: null,
  quantity: 1,
  total_cost: 10,
})

const DAYS: PlanDay[] = [
  { day_number: 1, date: '2026-10-01', city: 'Cairo', overnight_city: 'Cairo', services: [
    line('accommodation', 'Marriott Mena House | Cairo', 'accommodation'),
    line('meal', 'New Service', 'meals'),
    line('other', 'checkin_assist', 'hotel_services'),
    line('other', 'Water Bottles', 'water'),
    line('transfer', 'full_service CAI', 'airport_services'),
    line('transportation', 'airport_transfer sedan Cairo', 'route'),
  ] },
  { day_number: 2, date: '2026-10-02', city: 'Giza', overnight_city: 'Cairo', services: [
    line('accommodation', 'Marriott Mena House | Cairo', 'accommodation'),
    line('entrance_fee', 'Giza Plateau', 'entrance_fees'),
    line('entrance_fee', 'The Grand Egyptian Museum (GEM)', 'entrance_fees'),
    line('guide', 'English Cairo', 'guide'),
    line('meal', 'khufu restaurant lunch', 'meals'),
    line('other', 'Camel Ride', 'experiences'),
    line('tip', 'tipping', 'tipping'),
    line('transportation', 'day_tour sedan Cairo', 'route'),
  ] },
  { day_number: 3, date: '2026-10-03', city: 'Alexandria', overnight_city: 'Cairo', services: [
    line('accommodation', 'Marriott Mena House | Cairo', 'accommodation'),
    line('entrance_fee', 'Catacombs', 'entrance_fees'),
    line('guide', 'English Alexandria', 'guide'),
    line('meal', 'Fish Market Restaurant lunch', 'meals'),
    line('transportation', 'intercity_day_trip sedan Cairo', 'route'),
  ] },
  { day_number: 4, date: '2026-10-04', city: 'Cairo', overnight_city: null, services: [
    line('other', 'checkout_assist', 'hotel_services'),
    line('transfer', 'full_service CAI', 'airport_services'),
    line('transportation', 'airport_transfer sedan Cairo', 'route'),
  ] },
]

const ITINERARY = { id: 'it1', client_name: 'Tersa', num_adults: 2, currency: 'EUR', start_date: '2026-10-01' }

const plan = (existing: Array<{ supplier_id: string | null; document_type: string; supplier_name: string | null }> = []) =>
  planSupplierDocuments({ tenantId: 't1', itinerary: ITINERARY, days: DAYS, suppliers: {}, existing, documentTypes: null })

const names = (rows: ReturnType<typeof plan>, name: string) =>
  ((rows.find(r => r.supplier_name === name)?.services ?? []) as Array<{ service_name: string }>).map(s => s.service_name)

describe('the documents ITN-S-2026-8987 needs', () => {
  it('one per kind and place, airport and hotel assist on their own order', () => {
    expect(plan().map(r => r.supplier_name).sort()).toEqual([
      'Alexandria Entrance Fees',
      'Alexandria Restaurant & Meals',
      'Cairo Entrance Fees',
      'Cairo Guide Services',
      'Cairo Hotel',
      'Cairo Meet & Assist',
      'Cairo Restaurant & Meals',
      'Cairo Transportation',
    ])
  })

  it('the driver’s voucher carries the driving only', () => {
    const rows = plan()
    expect(names(rows, 'Cairo Transportation')).toEqual([
      'airport_transfer sedan Cairo', 'day_tour sedan Cairo', 'intercity_day_trip sedan Cairo', 'airport_transfer sedan Cairo',
    ])
    expect(names(rows, 'Cairo Meet & Assist')).toEqual(['checkin_assist', 'full_service CAI', 'checkout_assist', 'full_service CAI'])
  })

  it('the hotel checks out the morning after the last night', () => {
    const hotel = plan().find(r => r.document_type === 'hotel_voucher')!
    expect(hotel.check_in).toBe('2026-10-01')
    expect(hotel.check_out).toBe('2026-10-04')
  })

  it('what the trip already has is not made again — only what is missing', () => {
    const missing = plan([
      { supplier_id: null, document_type: 'hotel_voucher', supplier_name: 'Cairo Hotel' },
      { supplier_id: null, document_type: 'transport_voucher', supplier_name: 'Cairo Transportation' },
      { supplier_id: null, document_type: 'service_order', supplier_name: 'Alexandria Entrance Fees' },
      { supplier_id: null, document_type: 'service_order', supplier_name: 'Alexandria Restaurant & Meals' },
    ])
    expect(missing.map(r => r.supplier_name).sort()).toEqual([
      'Cairo Entrance Fees', 'Cairo Guide Services', 'Cairo Meet & Assist', 'Cairo Restaurant & Meals',
    ])
  })
})

describe('dayAfter', () => {
  it('rolls over months and years; nothing for no date', () => {
    expect(dayAfter('2026-10-31')).toBe('2026-11-01')
    expect(dayAfter('2026-12-31')).toBe('2027-01-01')
    expect(dayAfter('2028-02-28')).toBe('2028-02-29')
    expect(dayAfter(null)).toBeNull()
    expect(dayAfter('')).toBeNull()
  })
})
