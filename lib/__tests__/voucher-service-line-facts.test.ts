// Supplier Network step 6c: a voucher shows what the booking's service line
// knows — pickup time and place, and the supplier's car / guide / driver once
// they accepted. Nothing is invented.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { planSupplierDocuments, documentHash, type PlanDay } from '@/lib/documents/plan-supplier-documents'
import { factsByService, lineFactsNote, notesWithFacts, type ServiceLineFacts } from '@/lib/documents/service-line-facts'

const facts = (over: Partial<ServiceLineFacts> = {}): ServiceLineFacts => ({
  status: 'assigned', service_time: '09:30:00', pickup_location: 'Mena House', dropoff_location: 'Cairo Airport',
  assigned_vehicle_plate: 'ABC 123', assigned_guide_name: null, assigned_guide_phone: null, driver_note: 'Mohamed 0100',
  ...over,
})

describe('the facts a voucher line gets', () => {
  it('time, pickup, drop-off, then the car and driver', () => {
    expect(lineFactsNote(facts())).toBe('09:30 · Pickup: Mena House · Drop-off: Cairo Airport · Car ABC 123 · Driver: Mohamed 0100')
  })

  it('the guide with their phone', () => {
    expect(lineFactsNote(facts({ service_time: null, pickup_location: null, dropoff_location: null, assigned_vehicle_plate: null, driver_note: null, assigned_guide_name: 'Ali', assigned_guide_phone: '+20 100' })))
      .toBe('Guide Ali (+20 100)')
  })

  it('no car / guide / driver until the supplier accepted — only what the office set', () => {
    for (const status of ['pending', 'requested', 'declined', 'expired']) {
      expect(lineFactsNote(facts({ status })), status).toBe('09:30 · Pickup: Mena House · Drop-off: Cairo Airport')
    }
  })

  it('nothing known = nothing added; own notes stay first', () => {
    const empty = facts({ status: 'pending', service_time: null, pickup_location: null, dropoff_location: null })
    expect(notesWithFacts('Bring water', empty)).toBe('Bring water')
    expect(notesWithFacts(null, undefined)).toBeNull()
    expect(notesWithFacts('Bring water', facts({ status: 'pending', pickup_location: null, dropoff_location: null }))).toBe('Bring water · 09:30')
  })

  it('a Not needed line is ignored; with two live lines the latest wins', () => {
    const rows = [
      { itinerary_service_id: 's1', ...facts({ status: 'cancelled', assigned_vehicle_plate: 'OLD' }), updated_at: '2026-11-03' },
      { itinerary_service_id: 's1', ...facts({ assigned_vehicle_plate: 'A' }), updated_at: '2026-11-01' },
      { itinerary_service_id: 's1', ...facts({ assigned_vehicle_plate: 'B' }), updated_at: '2026-11-02' },
      { itinerary_service_id: null, ...facts() },
    ]
    const by = factsByService(rows)
    expect(Object.keys(by)).toEqual(['s1'])
    expect(by.s1.assigned_vehicle_plate).toBe('B')
  })
})

describe('on the generated voucher', () => {
  const transfer = { id: 's1', service_type: 'transportation', service_name: 'airport_transfer sedan Cairo', supplier_id: null, quantity: 1, total_cost: 30, notes: null }
  const days = (services: unknown[]): PlanDay[] => [{ day_number: 1, date: '2026-11-03', city: 'Cairo', overnight_city: null, services }]
  const ITIN = { id: 'it1', client_name: 'Tersa', num_adults: 2, currency: 'EUR', start_date: '2026-11-03' }
  const plan = (services: unknown[], serviceLines?: Record<string, ServiceLineFacts>) =>
    planSupplierDocuments({ tenantId: 't1', itinerary: ITIN, days: days(services), suppliers: {}, existing: [], documentTypes: null, serviceLines })
  const transport = (rows: ReturnType<typeof plan>) => rows.find(r => r.document_type === 'transport_voucher')!

  it('one transfer: the line notes carry the facts, and the voucher fields get time, pickup, drop-off and driver', () => {
    const doc = transport(plan([transfer], { s1: facts() }))
    expect((doc.services as Array<{ notes: string }>)[0].notes).toContain('Car ABC 123')
    expect(doc.pickup_time).toBe('09:30')
    expect(doc.pickup_location).toBe('Mena House')
    expect(doc.dropoff_location).toBe('Cairo Airport')
    expect(doc.driver_name).toBe('Mohamed 0100')
  })

  it('a driver the trip already names is kept', () => {
    const doc = transport(plan([{ ...transfer, driver_name: 'Hassan' }], { s1: facts() }))
    expect(doc.driver_name).toBe('Hassan')
  })

  it('several transfers keep their time and pickup on each line, not the voucher', () => {
    const doc = transport(plan([transfer, { ...transfer, id: 's2', service_name: 'day_tour sedan Cairo' }], { s1: facts(), s2: facts({ service_time: '14:00' }) }))
    expect(doc.pickup_time ?? null).toBeNull()
    expect((doc.services as Array<{ notes: string }>).map(s => s.notes.slice(0, 5))).toEqual(['09:30', '14:00'])
  })

  it('no service line = the voucher exactly as before', () => {
    const before = transport(plan([transfer]))
    expect(before.pickup_time ?? null).toBeNull()
    expect((before.services as Array<{ notes: unknown }>)[0].notes).toBeNull()
  })

  it('a newly named car changes the draft hash, so Sync brings an untouched draft in step', () => {
    const a = transport(plan([transfer], { s1: facts({ status: 'requested' }) }))
    const b = transport(plan([transfer], { s1: facts() }))
    expect(documentHash(a)).not.toBe(documentHash(b))
  })

  it('the documents route reads the service lines for this company only', () => {
    const src = readFileSync('app/api/itineraries/[id]/generate-documents/route.ts', 'utf8')
    expect(src).toContain(".from('booking_supplier_status').select(SERVICE_LINE_FACT_COLUMNS).in('itinerary_service_id', serviceIds).eq('tenant_id', tenantId)")
  })
})
