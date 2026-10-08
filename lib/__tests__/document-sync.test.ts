// Supplier documents that always match the itinerary (lib/documents/sync-plan).
//
// Shaped on live ITN-S-2026-8987 — Cairo, Giza, an Alexandria day trip from
// the Cairo hotel, Cairo — whose newest documents were a guide, a meals and an
// entrance document each missing services, with the hotel and transport ones
// left over, per city, from an earlier Generate.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import {
  planDocuments, reconcileDocuments, coverageWarnings, destinationOf, linesHash, KNOWN_SERVICE_TYPES,
  type PlanDay, type PlannedDoc, type ExistingDoc,
} from '@/lib/documents/sync-plan'

const read = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')
let n = 0
const svc = (service_type: string, service_name: string, extra: Record<string, unknown> = {}) =>
  ({ id: `s${++n}`, service_type, service_name, total_cost: 10, quantity: 2, ...extra })

const HOTEL = { supplier_name: 'Steigenberger Nile Palace' }
const RESTAURANT = 'sup-fish'

function trip(): PlanDay[] {
  n = 0
  return [
    { day_number: 1, date: '2026-10-01', city: 'Cairo', overnight_city: 'Cairo', services: [
      svc('airport_service', 'Airport Meet & Assist (International)'),
      svc('transportation', 'Airport/Hotel Transfer'),
      svc('hotel_service', 'Hotel Porterage & Assistance'),
      svc('accommodation', 'Steigenberger Nile Palace', HOTEL),
      svc('tips', 'Driver tip'),
    ] },
    { day_number: 2, date: '2026-10-02', city: 'Giza', overnight_city: 'Cairo', attractions: ['Pyramids'], services: [
      svc('transportation', 'Full day — Giza'),
      svc('guide', 'Japanese-speaking guide'),
      svc('entrance', 'Entrance Fees (non-EUR)', { notes: 'Sites: Pyramids of Giza, Sphinx' }),
      svc('meal', 'Lunch'),
      svc('supplies', 'Water'),
      svc('accommodation', 'Steigenberger Nile Palace', HOTEL),
    ] },
    { day_number: 3, date: '2026-10-03', city: 'Alexandria', overnight_city: 'Cairo', services: [
      svc('transportation', 'Day trip — Alexandria'),
      svc('guide', 'Japanese-speaking guide'),
      svc('entrance', 'Entrance Fees (non-EUR)', { notes: "Sites: Catacombs, Pompey's Pillar" }),
      svc('meal', 'Seafood lunch', { supplier_id: RESTAURANT }),
      svc('accommodation', 'Steigenberger Nile Palace', HOTEL),
    ] },
    { day_number: 4, date: '2026-10-04', city: 'Cairo', overnight_city: 'Cairo', services: [
      svc('transportation', 'Full day — Cairo'),
      svc('guide', 'Japanese-speaking guide'),
      svc('entrance', 'Egyptian Museum'),
      svc('meal', 'Lunch'),
      svc('accommodation', 'Steigenberger Nile Palace', HOTEL),
    ] },
    { day_number: 5, date: '2026-10-05', city: 'Cairo', overnight_city: null, services: [
      svc('transportation', 'Airport Transfer'),
      svc('airport_service', 'Airport Meet & Assist (International)'),
    ] },
  ]
}
const SUPPLIERS = { [RESTAURANT]: { id: RESTAURANT, name: 'Fish Market Alexandria' } }
const byTitle = (docs: PlannedDoc[], t: string) => docs.find(d => d.title === t)!

describe('every line lands on exactly one document, or is excluded on purpose', () => {
  it('nothing is dropped and nothing is doubled', () => {
    const days = trip()
    const { docs, excluded, totalLines } = planDocuments(days, SUPPLIERS)
    const onDocs = docs.flatMap(d => d.lines.map(l => l.service_id))
    expect(new Set(onDocs).size).toBe(onDocs.length)
    expect(onDocs.length + excluded.length).toBe(totalLines)
    expect(excluded.map(e => e.line.service_name).sort()).toEqual(['Driver tip', 'Water'])
    expect(excluded.every(e => e.reason.length > 0)).toBe(true)
  })

  it('one document per kind for the whole trip, not per city — each line keeps its day and city', () => {
    const { docs } = planDocuments(trip(), SUPPLIERS)
    expect(docs.map(d => d.title).sort()).toEqual([
      'Airport & Hotel Assistance', 'Entrance Fees', 'Fish Market Alexandria', 'Guide Services',
      'Restaurant & Meals', 'Steigenberger Nile Palace', 'Transportation',
    ])
    const transport = byTitle(docs, 'Transportation')
    expect(transport.lines.map(l => [l.day_number, l.city])).toEqual([[1, 'Cairo'], [2, 'Giza'], [3, 'Alexandria'], [4, 'Cairo'], [5, 'Cairo']])
    expect(byTitle(docs, 'Guide Services').lines).toHaveLength(3)
    expect(byTitle(docs, 'Airport & Hotel Assistance').lines).toHaveLength(3)
  })

  it('entrance lines name their sites; a meal with a restaurant goes on that restaurant’s order', () => {
    const { docs } = planDocuments(trip(), SUPPLIERS)
    expect(byTitle(docs, 'Entrance Fees').lines.map(l => l.service_name)).toEqual([
      'Entrance Fees (non-EUR) — Pyramids of Giza, Sphinx', "Entrance Fees (non-EUR) — Catacombs, Pompey's Pillar", 'Egyptian Museum',
    ])
    expect(byTitle(docs, 'Restaurant & Meals').lines.map(l => l.day_number)).toEqual([2, 4])
    const fish = byTitle(docs, 'Fish Market Alexandria')
    expect([fish.docType, fish.supplierId, fish.lines.map(l => l.service_name)]).toEqual(['service_order', RESTAURANT, ['Seafood lunch']])
  })

  it('one hotel voucher per stay, checking out the morning after the last night', () => {
    const { docs } = planDocuments(trip(), SUPPLIERS)
    const hotel = byTitle(docs, 'Steigenberger Nile Palace')
    expect([hotel.docType, hotel.firstDate, hotel.checkOut, hotel.lines.length]).toEqual(['hotel_voucher', '2026-10-01', '2026-10-05', 4])
  })

  it('a break in the nights is a second stay, a second voucher', () => {
    const days = trip()
    days[2].services = days[2].services!.filter(s => s.service_type !== 'accommodation')
    const stays = planDocuments(days, SUPPLIERS).docs.filter(d => d.docType === 'hotel_voucher')
    expect(stays.map(s => [s.firstDate, s.checkOut])).toEqual([['2026-10-01', '2026-10-03'], ['2026-10-04', '2026-10-05']])
    expect(new Set(stays.map(s => s.key)).size).toBe(2)
  })
})

describe('the Pricing Grid’s lines go where they belong', () => {
  it('experiences and boat rides, airport and hotel services, the guide’s bed — by the grid’s own slot', () => {
    expect(destinationOf({ service_type: 'other', description: '[pricing-grid:experiences] Balloon ride' })).toEqual({ docType: 'service_order', kind: 'activities' })
    expect(destinationOf({ service_type: 'other', description: '[pricing-grid:boat_rides] Felucca' })).toEqual({ docType: 'service_order', kind: 'activities' })
    expect(destinationOf({ service_type: 'transfer', description: '[pricing-grid:airport_services] Meet & assist' })).toEqual({ docType: 'service_order', kind: 'assistance' })
    expect(destinationOf({ service_type: 'other', description: '[pricing-grid:hotel_services] Porterage' })).toEqual({ docType: 'service_order', kind: 'assistance' })
    expect(destinationOf({ service_type: 'other', description: '[pricing-grid:water] Water' })).toHaveProperty('excluded')
    expect(destinationOf({ service_type: 'accommodation', description: '[pricing-grid:cruise] MS Nile' })).toEqual({ docType: 'cruise_voucher' })
  })

  it('the throughout guide’s bed goes on the night’s hotel voucher', () => {
    const days: PlanDay[] = [
      { day_number: 1, date: '2026-10-01', city: 'Luxor', overnight_city: 'Luxor', services: [
        { id: 'h', service_type: 'accommodation', service_name: 'Winter Palace (5* | BB)', description: '[pricing-grid:accommodation] Winter Palace (5* | BB)' },
        { id: 'g', service_type: 'accommodation', service_name: 'Guide bed', description: '[pricing-grid:throughout_guide] bed' },
      ] },
      { day_number: 2, date: '2026-10-02', city: 'Luxor', services: [] },
    ]
    const hotels = planDocuments(days, {}).docs.filter(d => d.docType === 'hotel_voucher')
    expect(hotels.map(h => [h.title, h.lines.map(l => l.service_id)])).toEqual([['Winter Palace', ['h', 'g']]])
  })

  it('an unknown type is never dropped: it goes on Other Services', () => {
    expect(destinationOf({ service_type: 'sound_and_light' })).toEqual({ docType: 'service_order', kind: 'other' })
  })

  it('every service type the app writes is known — a new one cannot slip through silently', () => {
    const written = new Set<string>()
    for (const f of ['lib/ai/service-creation.ts', 'lib/ai/cruise-service-creation.ts']) {
      for (const m of read(f).matchAll(/service_type:\s*'(\w+)'/g)) written.add(m[1])
    }
    const save = read('app/api/pricing-grid/save/route.ts')
    const fn = save.slice(save.indexOf('function getServiceType'))
    for (const m of fn.slice(0, fn.indexOf('return map')).matchAll(/:\s*'(\w+)'/g)) written.add(m[1])
    const slots = read('app/pricing-grid/lib/slot-mapping.ts')
    const table = slots.slice(slots.indexOf('{', slots.indexOf('SLOT_TO_SERVICE_TYPE')), slots.indexOf('}', slots.indexOf('SLOT_TO_SERVICE_TYPE')))
    for (const m of table.matchAll(/:\s*'(\w+)'/g)) written.add(m[1])
    expect(written.size).toBeGreaterThan(10)
    for (const t of written) expect(KNOWN_SERVICE_TYPES, `service type '${t}' is written but the document plan does not know it`).toContain(t)
  })
})

// ── Sync ────────────────────────────────────────────────────────────────────

const asWritten = (p: PlannedDoc, over: Partial<ExistingDoc> = {}): ExistingDoc => ({
  id: `doc-${p.key}`, document_type: p.docType, document_number: null, supplier_id: p.supplierId, supplier_name: p.title,
  status: 'draft', services: JSON.parse(JSON.stringify(p.lines)), sync_key: p.key, synced_hash: linesHash(p.lines), ...over,
})

describe('Sync: the documents follow the trip', () => {
  it('the first sync on 8987: older per-city drafts are replaced, the older sent hotel voucher is kept and reported', () => {
    const { docs } = planDocuments(trip(), SUPPLIERS)
    const legacy: ExistingDoc[] = [
      { id: 'old-tv-cairo', document_type: 'transport_voucher', supplier_id: null, supplier_name: 'Cairo Transportation', status: 'draft', services: [], sync_key: null, synced_hash: null },
      { id: 'old-tv-alex', document_type: 'transport_voucher', supplier_id: null, supplier_name: 'Alexandria Transportation', status: 'draft', services: [], sync_key: null, synced_hash: null },
      { id: 'old-hv', document_type: 'hotel_voucher', supplier_id: null, supplier_name: 'Cairo Hotel', status: 'sent', services: [{ service_name: 'Hotel' }], sync_key: null, synced_hash: null },
      { id: 'old-cancelled', document_type: 'guide_assignment', supplier_id: null, supplier_name: 'Giza Guide Services', status: 'cancelled', services: [], sync_key: null, synced_hash: null },
    ]
    const r = reconcileDocuments(docs, legacy)
    expect(r.retire.map(x => [x.docId, x.why]).sort()).toEqual([['old-tv-alex', 'replaced_older_draft'], ['old-tv-cairo', 'replaced_older_draft']])
    expect(r.attention).toEqual([expect.objectContaining({ docId: 'old-hv', reason: 'made_before_sync', title: 'Steigenberger Nile Palace' })])
    // Everything else is made, the hotel is not made twice.
    expect(r.create.map(p => p.title).sort()).toEqual(docs.filter(d => d.docType !== 'hotel_voucher').map(d => d.title).sort())
  })

  it('a second sync with nothing changed does nothing', () => {
    const { docs } = planDocuments(trip(), SUPPLIERS)
    const r = reconcileDocuments(docs, docs.map(p => asWritten(p)))
    expect([r.create.length, r.update.length, r.retire.length, r.attention.length, r.inSync.length]).toEqual([0, 0, 0, 0, docs.length])
  })

  it('the trip changed: an untouched draft is updated, an edited draft and a sent one are reported, not overwritten', () => {
    const before = planDocuments(trip(), SUPPLIERS).docs
    const meals = before.find(d => d.title === 'Restaurant & Meals')!
    const guide = before.find(d => d.title === 'Guide Services')!
    const entrance = before.find(d => d.title === 'Entrance Fees')!
    const existing = before.map(p =>
      p === guide ? asWritten(p, { services: [...p.lines].slice(1) })            // a person removed a line
      : p === entrance ? asWritten(p, { status: 'sent' })
      : asWritten(p))

    const days = trip()
    days[4].services!.push(svc('meal', 'Farewell dinner'), svc('guide', 'Guide — transfer day'), svc('entrance', 'Citadel'))
    const r = reconcileDocuments(planDocuments(days, SUPPLIERS).docs, existing)
    expect(r.update.map(u => u.planned.title)).toEqual(['Restaurant & Meals'])
    expect(r.update[0].docId).toBe(`doc-${meals.key}`)
    expect(r.attention.map(a => [a.title, a.reason]).sort()).toEqual([['Entrance Fees', 'sent_and_changed'], ['Guide Services', 'edited_and_changed']])
  })

  it('“Replace with the itinerary’s version” is the only way a sent or edited document is rewritten', () => {
    const before = planDocuments(trip(), SUPPLIERS).docs
    const entrance = before.find(d => d.title === 'Entrance Fees')!
    const existing = before.map(p => asWritten(p, p === entrance ? { status: 'sent' } : {}))
    const days = trip()
    days[4].services!.push(svc('entrance', 'Citadel'))
    const r = reconcileDocuments(planDocuments(days, SUPPLIERS).docs, existing, { force: [`doc-${entrance.key}`] })
    expect(r.update.map(u => u.docId)).toEqual([`doc-${entrance.key}`])
    expect(r.attention).toEqual([])
  })

  it('services removed from the trip: an untouched draft is retired, a sent document is reported', () => {
    const before = planDocuments(trip(), SUPPLIERS).docs
    const fish = before.find(d => d.title === 'Fish Market Alexandria')!
    const assist = before.find(d => d.title === 'Airport & Hotel Assistance')!
    const existing = before.map(p => asWritten(p, p === assist ? { status: 'confirmed' } : {}))
    const days = trip().map(d => ({ ...d, services: d.services!.filter(s => s.supplier_id !== RESTAURANT && !/^(airport|hotel)_service$/.test(String(s.service_type))) }))
    const r = reconcileDocuments(planDocuments(days, SUPPLIERS).docs, existing)
    expect(r.retire).toEqual([{ docId: `doc-${fish.key}`, why: 'not_needed' }])
    expect(r.attention).toEqual([expect.objectContaining({ docId: `doc-${assist.key}`, reason: 'no_longer_on_trip' })])
  })

  it('asked for some kinds only, it leaves the others alone', () => {
    const { docs } = planDocuments(trip(), SUPPLIERS)
    const r = reconcileDocuments(docs, [], { onlyTypes: ['hotel_voucher'] })
    expect(r.create.map(p => p.docType)).toEqual(['hotel_voucher'])
  })

  it('the hash ignores key order (the database reorders jsonb keys)', () => {
    expect(linesHash([{ a: 1, b: { c: 2, d: 3 } }])).toBe(linesHash([{ b: { d: 3, c: 2 }, a: 1 }]))
  })
})

describe('coverage warnings: nights and days that look unplanned', () => {
  it('a night with no hotel line, when the others have one', () => {
    const days = trip()
    days[2].services = days[2].services!.filter(s => s.service_type !== 'accommodation')
    expect(coverageWarnings(days)).toEqual([expect.objectContaining({ kind: 'night_without_hotel', dayNumber: 3 })])
  })
  it('sightseeing with no vehicle', () => {
    const days = trip()
    days[3].services = days[3].services!.filter(s => s.service_type !== 'transportation')
    expect(coverageWarnings(days)).toEqual([expect.objectContaining({ kind: 'day_without_transport', dayNumber: 4 })])
  })
  it('a cruise day’s sightseeing needs no vehicle — the cruise takes them', () => {
    const days: PlanDay[] = [
      { day_number: 1, date: '2026-10-01', city: 'Luxor', overnight_city: 'Luxor', services: [svc('transportation', 'Transfer'), svc('accommodation', 'Hotel', HOTEL)] },
      { day_number: 2, date: '2026-10-02', city: 'Luxor', overnight_city: 'On board MS Nile', services: [svc('cruise', 'MS Nile - Full Board'), svc('entrance', 'Karnak Temple')] },
      { day_number: 3, date: '2026-10-03', city: 'Edfu', overnight_city: 'On board MS Nile', services: [svc('cruise', 'MS Nile - Full Board'), svc('entrance', 'Edfu Temple')] },
      { day_number: 4, date: '2026-10-04', city: 'Aswan', overnight_city: null, services: [svc('entrance', 'High Dam'), svc('transportation', 'Airport transfer')] },
    ]
    expect(coverageWarnings(days)).toEqual([])
  })
  it('a trip without hotels at all is not nagged night by night; 8987 as built has nothing to warn about', () => {
    const days = trip().map(d => ({ ...d, services: d.services!.filter(s => s.service_type !== 'accommodation') }))
    expect(coverageWarnings(days)).toEqual([])
    expect(coverageWarnings(trip())).toEqual([])
  })
})

describe('the route', () => {
  const src = read('app/api/itineraries/[id]/generate-documents/route.ts')
  it('plans with sync-plan and reads services by both day columns', () => {
    expect(src).toContain('planDocuments(')
    expect(src).toContain('reconcileDocuments(')
    expect(src).toContain("['day_id', 'itinerary_day_id']")
  })
  it('only retires drafts, and a replaced document goes back to draft to be sent again', () => {
    expect(src).toMatch(/status: 'cancelled'[\s\S]*\.eq\('status', 'draft'\)/)
    expect(src).toContain("status: 'draft', sent_at: null, confirmed_at: null")
  })
  it('migration 402 adds the two columns Sync needs', () => {
    const sql = read('supabase/migrations/402_supplier_documents_sync.sql')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS sync_key TEXT')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS synced_hash TEXT')
  })
})
