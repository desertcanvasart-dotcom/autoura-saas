// Sync (lib/documents/plan-supplier-documents: syncSupplierDocuments): Generate
// used to only ADD documents, so a draft it made kept its old lines when the
// trip changed, and one the trip no longer needed stayed as it was (live
// ITN-S-2026-8987). Now a draft Generate made and nobody touched since is
// brought in step or retired; anything a person edited or sent is never
// changed. Plus what the documents can't show: unplanned nights and days,
// and the lines that go on no document, with why.
import { describe, it, expect } from 'vitest'
import {
  planSupplierDocuments, syncSupplierDocuments, documentHash, isUntouchedDraft,
  coverageWarnings, excludedLines, type PlanDay, type PlanInput,
} from '@/lib/documents/plan-supplier-documents'

const line = (service_type: string, service_name: string, slot?: string, total_cost = 10) => ({
  service_type,
  service_name,
  description: slot ? `[pricing-grid:${slot}] ${service_name}` : null,
  supplier_id: null,
  quantity: 1,
  total_cost,
})

const trip = (): PlanDay[] => [
  { day_number: 1, date: '2026-10-01', city: 'Cairo', overnight_city: 'Cairo', services: [
    line('accommodation', 'Marriott Mena House | Cairo', 'accommodation'),
    line('transportation', 'airport_transfer sedan Cairo', 'route'),
  ] },
  { day_number: 2, date: '2026-10-02', city: 'Giza', overnight_city: 'Cairo', services: [
    line('accommodation', 'Marriott Mena House | Cairo', 'accommodation'),
    line('entrance_fee', 'Giza Plateau', 'entrance_fees'),
    line('meal', 'khufu restaurant lunch', 'meals'),
    line('transportation', 'day_tour sedan Cairo', 'route'),
  ] },
  { day_number: 3, date: '2026-10-03', city: 'Cairo', overnight_city: null, services: [
    line('transportation', 'airport_transfer sedan Cairo', 'route'),
  ] },
]

const base = (days: PlanDay[], existing: PlanInput['existing'] = []): PlanInput => ({
  tenantId: 't1', itinerary: { id: 'it1', client_name: 'Sato', currency: 'EUR', num_adults: 2 },
  days, suppliers: {}, existing, documentTypes: null,
})

/** The documents a first Generate writes, as the database returns them. */
const generated = (days: PlanDay[]): PlanInput['existing'] =>
  planSupplierDocuments(base(days)).map((r, i) => ({
    id: `d${i}`, document_number: `SO-${i}`,
    supplier_id: r.supplier_id ?? null, document_type: r.document_type, supplier_name: r.supplier_name,
    check_in: r.check_in ?? null, check_out: r.check_out ?? null, service_date: r.service_date ?? null,
    // jsonb hands keys back in its own order.
    services: (r.services as Array<Record<string, unknown>>).map(l => Object.fromEntries(Object.entries(l).reverse())),
    status: 'draft', sync_key: r.sync_key ?? null, synced_hash: r.synced_hash ?? null,
  }))

describe('the hash notices a hand edit, not key order', () => {
  it('a document as written hashes to its synced_hash, whatever order jsonb returns', () => {
    for (const d of generated(trip())) expect(isUntouchedDraft(d)).toBe(true)
  })
  it('a changed line or date is an edit', () => {
    const [d] = generated(trip())
    const services = (d.services as Array<Record<string, unknown>>).map((l, i) => i === 0 ? { ...l, quantity: 3 } : l)
    expect(documentHash({ ...d, services })).not.toBe(d.synced_hash)
    expect(documentHash({ ...d, check_out: '2026-10-09' })).not.toBe(d.synced_hash)
  })
})

describe('Sync', () => {
  it('nothing changed: nothing to do', () => {
    const days = trip()
    const plan = syncSupplierDocuments(base(days, generated(days)))
    expect(plan.create).toEqual([])
    expect(plan.update).toEqual([])
    expect(plan.retire).toEqual([])
    expect(plan.stale).toEqual([])
  })

  it('a line added to a kind the trip already has: the untouched draft takes it — no second document', () => {
    const days = trip()
    const existing = generated(days)
    days[0].services!.push(line('entrance_fee', 'Egyptian Museum', 'entrance_fees'))
    const plan = syncSupplierDocuments(base(days, existing))
    expect(plan.create).toEqual([])
    expect(plan.update.map(u => u.supplier_name)).toEqual(['Cairo Entrance Fees'])
    const lines = plan.update[0].fields.services as Array<{ service_name: string }>
    expect(lines.map(l => l.service_name).sort()).toEqual(['Egyptian Museum', 'Giza Plateau'])
    expect(plan.update[0].fields.synced_hash).toBe(documentHash(plan.update[0].fields))
  })

  it('a line removed: the draft is updated; a kind the trip no longer has is retired', () => {
    const days = trip()
    const existing = generated(days)
    days[1].services = days[1].services!.filter(s => s.service_type !== 'meal')
    const plan = syncSupplierDocuments(base(days, existing))
    expect(plan.retire.map(r => r.supplier_name)).toEqual(['Cairo Restaurant & Meals'])
    expect(plan.create).toEqual([])
    expect(plan.stale).toEqual([])
  })

  it('a draft a person edited is never changed: its lines stay put, it is listed when out of date', () => {
    const days = trip()
    const existing = generated(days).map(d => d.supplier_name === 'Cairo Restaurant & Meals'
      ? { ...d, services: [...(d.services as unknown[]), { day_number: 2, service_type: 'meal', service_name: 'dinner cruise', total_cost: 40 }] }
      : d)
    days[1].services = days[1].services!.filter(s => s.service_type !== 'meal')
    const plan = syncSupplierDocuments(base(days, existing))
    expect(plan.retire).toEqual([])
    expect(plan.update).toEqual([])
    expect(plan.stale.map(s => s.supplier_name)).toEqual(['Cairo Restaurant & Meals'])
  })

  it('a sent document is never changed, and its lines are not put on a new one', () => {
    const days = trip()
    const existing = generated(days).map(d => d.document_type === 'transport_voucher' ? { ...d, status: 'sent' } : d)
    days[1].services!.push(line('transportation', 'evening transfer sedan Cairo', 'route'))
    const plan = syncSupplierDocuments(base(days, existing))
    expect(plan.update.find(u => u.supplier_name === 'Cairo Transportation')).toBeUndefined()
    // The new line gets a document of its own; the sent voucher's lines stay on it.
    expect(plan.create.map(r => r.supplier_name)).toEqual(['Cairo Transportation'])
    expect((plan.create[0].services as Array<{ service_name: string }>).map(l => l.service_name)).toEqual(['evening transfer sedan Cairo'])
  })

  it('documents made before Sync (no sync_key) are left as they were', () => {
    const days = trip()
    const existing = generated(days).map(d => ({ ...d, sync_key: null, synced_hash: null }))
    days[1].services = days[1].services!.filter(s => s.service_type !== 'meal')
    const plan = syncSupplierDocuments(base(days, existing))
    expect(plan.retire).toEqual([])
    expect(plan.update).toEqual([])
    expect(plan.stale.map(s => s.supplier_name)).toEqual(['Cairo Restaurant & Meals'])
  })

  it('a sync for one kind of document retires no other kind', () => {
    const days = trip()
    const existing = generated(days)
    days[1].services = days[1].services!.filter(s => s.service_type !== 'meal')
    const plan = syncSupplierDocuments({ ...base(days, existing), documentTypes: ['hotel_voucher'] })
    expect(plan.retire).toEqual([])
  })
})

describe('the grid’s extras go on a document', () => {
  it('experiences and boat rides on Activities & Experiences; the grid’s Other on Other Services; water on none', () => {
    const days = trip()
    days[1].services!.push(
      line('other', 'Camel Ride', 'experiences'),
      line('other', 'Felucca', 'boat_rides'),
      line('other', 'Other (Group)', 'other_group'),
      line('other', 'Water Bottles', 'water'),
    )
    const names = planSupplierDocuments(base(days)).map(r => r.supplier_name)
    expect(names).toContain('Cairo Activities & Experiences')
    expect(names).toContain('Cairo Other Services')
    expect(excludedLines(days).map(l => [l.service_name, l.reason])).toEqual([['Water Bottles', 'Water and supplies are bought by the team']])
  })
})

describe('coverage warnings', () => {
  it('a complete trip has none', () => {
    expect(coverageWarnings(trip())).toEqual([])
  })
  it('a night with no hotel line, when other nights have one', () => {
    const days = trip()
    days[1].services = days[1].services!.filter(s => s.service_type !== 'accommodation')
    expect(coverageWarnings(days).map(w => [w.kind, w.dayNumber])).toEqual([['night_without_hotel', 2]])
  })
  it('the last day has no night, and a trip that books no beds at all is not flagged', () => {
    const days = trip().map(d => ({ ...d, services: d.services!.filter(s => s.service_type !== 'accommodation') }))
    expect(coverageWarnings(days).filter(w => w.kind === 'night_without_hotel')).toEqual([])
  })
  it('sightseeing with no vehicle that day', () => {
    const days = trip()
    days[1].services = days[1].services!.filter(s => s.service_type !== 'transportation')
    expect(coverageWarnings(days).map(w => [w.kind, w.dayNumber])).toEqual([['day_without_transport', 2]])
  })
  it('a trip with sightseeing and no transport at all: one warning, not one a day', () => {
    const days = trip().map(d => ({ ...d, services: d.services!.filter(s => s.service_type !== 'transportation') }))
    expect(coverageWarnings(days).map(w => w.kind)).toEqual(['trip_without_transport'])
  })
  it('a cruise day, and the morning after a night on board, need no vehicle', () => {
    const days: PlanDay[] = [
      { day_number: 1, date: '2026-10-01', city: 'Luxor', overnight_city: 'On board', services: [
        line('accommodation', 'MS Nile Goddess', 'cruise'), line('entrance_fee', 'Karnak', 'entrance_fees'),
      ] },
      { day_number: 2, date: '2026-10-02', city: 'Edfu', overnight_city: 'Aswan', services: [
        line('accommodation', 'Old Cataract | Aswan', 'accommodation'), line('entrance_fee', 'Edfu Temple', 'entrance_fees'),
      ] },
      { day_number: 3, date: '2026-10-03', city: 'Aswan', overnight_city: null, services: [
        line('entrance_fee', 'Philae', 'entrance_fees'), line('transportation', 'day_tour sedan Aswan', 'route'),
      ] },
    ]
    expect(coverageWarnings(days)).toEqual([])
  })
})
