// Supplier documents: entrance lines name their sites, and "Generate" may be
// asked for some kinds only (lib/documents/group-services). The grouping
// itself is lib/documents/sync-plan (document-sync.test.ts).
import { describe, it, expect } from 'vitest'
import { entranceLineName, requestedDocTypes } from '@/lib/documents/group-services'

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

describe('some kinds only', () => {
  it('honours the document types asked for, under either name', () => {
    expect(requestedDocTypes({ documentTypes: ['hotel_voucher'] })).toEqual(['hotel_voucher'])
    expect(requestedDocTypes({ document_types: ['service_order'] })).toEqual(['service_order'])
    expect(requestedDocTypes({})).toBeNull()
  })
})
