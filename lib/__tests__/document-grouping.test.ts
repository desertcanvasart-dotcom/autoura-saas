// Supplier documents from an itinerary: one per kind of service, per place
// (lib/documents/group-services). Live ITN-S-2026-8987 — Cairo, Giza, an
// Alexandria day trip from the Cairo hotel, Cairo — came out as a transport
// voucher per day's city, an "Alexandria Hotel" voucher for a Cairo night,
// entrance orders that named no site, and a full new set on every Generate.
import { describe, it, expect } from 'vitest'
import { docMappingFor, serviceCity, PlaceNames, entranceLineName, unassignedDocKey, requestedDocTypes } from '@/lib/documents/group-services'

describe('what goes on which document', () => {
  it('by service type; a grid cruise is a cruise voucher; tips, water and flights on none', () => {
    expect(docMappingFor({ service_type: 'transportation' })?.docType).toBe('transport_voucher')
    expect(docMappingFor({ service_type: 'entrance_fee' })).toEqual({ docType: 'service_order', category: 'entrance' })
    expect(docMappingFor({ service_type: 'accommodation', description: '[pricing-grid:cruise] MS Nile' })?.docType).toBe('cruise_voucher')
    for (const t of ['tip', 'water', 'flight']) expect(docMappingFor({ service_type: t })?.docType).toBeNull()
    expect(docMappingFor({ service_type: 'unknown' })).toBeUndefined()
  })
})

describe('where a service belongs', () => {
  const dayTrip = { city: 'Alexandria', overnight_city: 'Cairo' }
  it('a night, the vehicle and the guide: where the party is based — a day trip goes with its stay', () => {
    expect(serviceCity({ docType: 'hotel_voucher' }, dayTrip)).toBe('Cairo')
    expect(serviceCity({ docType: 'transport_voucher' }, dayTrip)).toBe('Cairo')
    expect(serviceCity({ docType: 'guide_assignment' }, dayTrip)).toBe('Cairo')
  })
  it('meals and sites: where they are', () => {
    expect(serviceCity({ docType: 'service_order', category: 'entrance' }, dayTrip)).toBe('Alexandria')
    expect(serviceCity({ docType: 'service_order', category: 'meals' }, dayTrip)).toBe('Alexandria')
  })
  it('no overnight city, or a night on board: the day’s city', () => {
    expect(serviceCity({ docType: 'transport_voucher' }, { city: 'Luxor', overnight_city: null })).toBe('Luxor')
    expect(serviceCity({ docType: 'transport_voucher' }, { city: 'Edfu', overnight_city: 'On board MS Nile' })).toBe('Edfu')
  })
})

describe('one place for cities a short drive apart', () => {
  it('Giza joins Cairo when Cairo came first; Alexandria and Luxor stay their own', () => {
    const places = new PlaceNames()
    expect(['Cairo', 'Giza', 'cairo', 'Alexandria', 'Luxor'].map(c => places.name(c))).toEqual(['Cairo', 'Cairo', 'Cairo', 'Alexandria', 'Luxor'])
  })
  it('a city not on file is only ever itself', () => {
    const places = new PlaceNames()
    expect(['Cairo', 'Somewhere New', 'Elsewhere'].map(c => places.name(c))).toEqual(['Cairo', 'Somewhere New', 'Elsewhere'])
  })
})

describe('an entrance line names its sites', () => {
  it('its own name when it is a site', () => {
    expect(entranceLineName({ service_name: 'Catacombs of Kom El Shoqafa' }, ['x'])).toBe('Catacombs of Kom El Shoqafa')
  })
  it('the AI builder’s one generic line: the sites from its notes', () => {
    expect(entranceLineName({ service_name: 'Entrance Fees (non-EUR)', notes: "Sites: Catacombs, Pompey's Pillar" }, [])).toBe("Entrance Fees (non-EUR) — Catacombs, Pompey's Pillar")
    expect(entranceLineName({ service_name: 'Entrance Fees (EUR)', notes: 'Inside: Karnak Temple | Photo stops: Colossi' }, [])).toBe('Entrance Fees (EUR) — Karnak Temple')
  })
  it('no notes: the day’s attractions; nothing at all: as it was', () => {
    expect(entranceLineName({ service_name: 'Entrance Fees' }, ['Egyptian Museum', 'Citadel'])).toBe('Entrance Fees — Egyptian Museum, Citadel')
    expect(entranceLineName({ service_name: 'Entrance Fees' }, [])).toBe('Entrance Fees')
  })
})

describe('regenerating', () => {
  it('recognises a document it already made by its kind and title', () => {
    expect(unassignedDocKey('transport_voucher', 'Cairo Transportation')).toBe(unassignedDocKey('transport_voucher', ' cairo transportation '))
    expect(unassignedDocKey('service_order', 'Cairo Entrance Fees')).not.toBe(unassignedDocKey('service_order', 'Cairo Restaurant & Meals'))
  })
  it('honours the document types asked for, under either name', () => {
    expect(requestedDocTypes({ documentTypes: ['hotel_voucher'] })).toEqual(['hotel_voucher'])
    expect(requestedDocTypes({ document_types: ['service_order'] })).toEqual(['service_order'])
    expect(requestedDocTypes({})).toBeNull()
  })
})
