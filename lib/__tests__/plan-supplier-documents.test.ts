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
      'Cairo Meet & Assist',
      'Cairo Restaurant & Meals',
      'Cairo Transportation',
      'Marriott Mena House | Cairo',
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

describe('one hotel voucher per stay', () => {
  const night = (date: string, name: string, slot = 'accommodation', supplier_id: string | null = null) => ({
    day_number: 0, date, city: 'Cairo', overnight_city: 'Cairo',
    services: [{ service_type: 'accommodation', service_name: name, description: `[pricing-grid:${slot}] ${name}`, supplier_id, quantity: 1, total_cost: 100 }],
  })
  const nightsPlan = (days: PlanDay[], existing: Parameters<typeof planSupplierDocuments>[0]['existing'] = [], suppliers = {}) =>
    planSupplierDocuments({ tenantId: 't1', itinerary: ITINERARY, days, suppliers, existing, documentTypes: null })
      .filter(r => r.document_type === 'hotel_voucher' || r.document_type === 'cruise_voucher')
      .map(r => [r.document_type, r.supplier_name, r.check_in, r.check_out])

  // Cairo, a 3-night cruise, Cairo again at the same hotel.
  const CAIRO_CRUISE_CAIRO: PlanDay[] = [
    night('2026-11-01', 'Kempinski Nile Hotel (standard | BB)'),
    night('2026-11-02', 'Kempinski Nile Hotel (standard | BB)'),
    night('2026-11-03', 'MS Nile Goddess (3N, standard)', 'cruise'),
    night('2026-11-04', 'MS Nile Goddess (3N, standard)', 'cruise'),
    night('2026-11-05', 'MS Nile Goddess (3N, standard)', 'cruise'),
    night('2026-11-06', 'Kempinski Nile Hotel (standard | BB)'),
  ]

  it('a hotel left for a cruise and come back to is two stays, never booked through the cruise', () => {
    expect(nightsPlan(CAIRO_CRUISE_CAIRO)).toEqual([
      ['hotel_voucher', 'Kempinski Nile Hotel', '2026-11-01', '2026-11-03'],
      ['hotel_voucher', 'Kempinski Nile Hotel', '2026-11-06', '2026-11-07'],
      ['cruise_voucher', 'MS Nile Goddess', '2026-11-03', '2026-11-06'],
    ])
  })

  it('two hotels in one city are two vouchers', () => {
    expect(nightsPlan([
      night('2026-11-01', 'Marriott Mena House (deluxe | BB)'),
      night('2026-11-02', 'Kempinski Nile Hotel (standard | BB)'),
      night('2026-11-03', 'Kempinski Nile Hotel (standard | BB)'),
    ])).toEqual([
      ['hotel_voucher', 'Marriott Mena House', '2026-11-01', '2026-11-02'],
      ['hotel_voucher', 'Kempinski Nile Hotel', '2026-11-02', '2026-11-04'],
    ])
  })

  it('a supplier booked for two stays gets two vouchers, under the supplier’s name', () => {
    const suppliers = { s1: { id: 's1', name: 'Kempinski Nile Hotel', type: 'hotel' } }
    const days = [
      night('2026-11-01', 'Kempinski Nile Hotel (standard | BB)', 'accommodation', 's1'),
      night('2026-11-02', 'Kempinski Nile Hotel (standard | BB)', 'accommodation', 's1'),
      night('2026-11-06', 'Kempinski Nile Hotel (standard | BB)', 'accommodation', 's1'),
    ]
    expect(nightsPlan(days, [], suppliers)).toEqual([
      ['hotel_voucher', 'Kempinski Nile Hotel', '2026-11-01', '2026-11-03'],
      ['hotel_voucher', 'Kempinski Nile Hotel', '2026-11-06', '2026-11-07'],
    ])
  })

  it('a supplement line goes on the stay its night falls in', () => {
    const days = CAIRO_CRUISE_CAIRO.slice(0, 2)
    days[1] = { ...days[1], services: [...days[1].services!, { service_type: 'accommodation', service_name: 'Single supplement', description: '[pricing-grid:accommodation] Single supplement', supplier_id: null, quantity: 1, total_cost: 30 }] }
    const rows = planSupplierDocuments({ tenantId: 't1', itinerary: ITINERARY, days, suppliers: {}, existing: [], documentTypes: null })
    expect(rows).toHaveLength(1)
    expect((rows[0].services as unknown[]).length).toBe(3)
  })

  it('a voucher made before this — one "Cairo Hotel" across both stays — is not made again', () => {
    const legacy = [{ supplier_id: null, document_type: 'hotel_voucher', supplier_name: 'Cairo Hotel', check_in: '2026-11-01', check_out: '2026-11-07' }]
    expect(nightsPlan(CAIRO_CRUISE_CAIRO, legacy)).toEqual([
      ['cruise_voucher', 'MS Nile Goddess', '2026-11-03', '2026-11-06'],
    ])
  })

  it('a voucher for the first stay only leaves the second stay missing', () => {
    const first = [{ supplier_id: null, document_type: 'hotel_voucher', supplier_name: 'Kempinski Nile Hotel', check_in: '2026-11-01', check_out: '2026-11-03' }]
    expect(nightsPlan(CAIRO_CRUISE_CAIRO, first)).toEqual([
      ['hotel_voucher', 'Kempinski Nile Hotel', '2026-11-06', '2026-11-07'],
      ['cruise_voucher', 'MS Nile Goddess', '2026-11-03', '2026-11-06'],
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
