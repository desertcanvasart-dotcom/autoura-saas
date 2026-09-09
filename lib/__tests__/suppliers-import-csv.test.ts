import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSuppliersCsv, splitAgainstExisting, splitTypes, resolveImportTypes } from '@/lib/suppliers/import-csv'

// ============================================
// Suppliers CSV import (B-item 7)
// ============================================
// The export's own format round-trips; identity rows are refused with the
// reason named; in-file duplicate names are refused (never last-row-wins);
// existing tenant suppliers are skipped — an import creates, it never
// silently updates.

const EXPORT_HEADERS = 'Name,Type,Contact,Email,Phone,City,Commission,Status'

describe('parseSuppliersCsv', () => {
  it("round-trips the Export button's own format", () => {
    const csv = [
      EXPORT_HEADERS,
      'Nile Star Hotel,Hotel,Ahmed,ahmed@nilestar.eg,+20100000000,Cairo,10,active',
      'EgyptAir,Airline,,sales@egyptair.com,,Cairo,5,active',
    ].join('\n')
    const r = parseSuppliersCsv(csv)
    expect(r.parseError).toBeUndefined()
    expect(r.refused).toEqual([])
    expect(r.records).toHaveLength(2)
    expect(r.records[0]).toMatchObject({
      row: 2,
      name: 'Nile Star Hotel',
      type: 'hotel',
      contact_name: 'Ahmed',
      contact_email: 'ahmed@nilestar.eg',
      contact_phone: '+20100000000',
      city: 'Cairo',
      default_commission_rate: 10,
      status: 'active',
    })
    // Type normalizes to the DB's snake_case vocabulary.
    expect(r.records[1].type).toBe('airline')
  })

  it('carries the portable supplier_code from a Code column (fresh-tenant migration)', () => {
    const r = parseSuppliersCsv('Code,Name,Type\nSUP-0007,EgyptAir,air_carrier\n,Local Co,transport')
    expect(r.records[0].supplier_code).toBe('SUP-0007')
    // A row without a code carries none (left for the DB / a later reconcile).
    expect(r.records[1].supplier_code).toBeUndefined()
  })

  it('normalizes multi-word types to snake_case', () => {
    const r = parseSuppliersCsv('Name,Type\nDesert Wheels,Transport Company')
    expect(r.records[0].type).toBe('transport_company')
  })

  it('refuses a row missing its Name — the identity — with the reason named', () => {
    const r = parseSuppliersCsv(['Name,Type', ',hotel'].join('\n'))
    expect(r.records).toEqual([])
    expect(r.refused).toEqual([{ row: 2, reason: 'missing Name' }])
  })

  it("a missing Type is NOT a refusal: the row imports as 'other' and is reported", () => {
    // First real use: a 64-supplier list with no Type column bounced 64
    // times. Type is not identity — land the rows unclassified instead.
    const r = parseSuppliersCsv(['Name,Type', 'Ghost Lodge,'].join('\n'))
    expect(r.refused).toEqual([])
    expect(r.records).toEqual([expect.objectContaining({ name: 'Ghost Lodge', type: 'other' })])
    expect(r.typeDefaulted).toEqual(['Ghost Lodge'])
  })

  it('a file with no Type column at all imports every row as other', () => {
    const r = parseSuppliersCsv(['Name,City', 'Abdul Rahman,Cairo', 'Accor,Giza'].join('\n'))
    expect(r.records.map(x => x.type)).toEqual(['other', 'other'])
    expect(r.typeDefaulted).toEqual(['Abdul Rahman', 'Accor'])
  })

  it('recognizes Supplier Type / Category / Company header spellings', () => {
    const r = parseSuppliersCsv('Company Name,Supplier Type\nNile Star,Hotel')
    expect(r.records[0]).toMatchObject({ name: 'Nile Star', type: 'hotel' })
    expect(parseSuppliersCsv('Supplier,Category\nDesert Cars,Transport Company').records[0])
      .toMatchObject({ name: 'Desert Cars', type: 'transport_company' })
  })

  it('refuses in-file duplicate names (case-insensitive) — never last-row-wins', () => {
    const csv = ['Name,Type,City', 'Nile Star,hotel,Cairo', 'NILE STAR,hotel,Luxor'].join('\n')
    const r = parseSuppliersCsv(csv)
    expect(r.records).toHaveLength(1)
    expect(r.records[0].city).toBe('Cairo') // the FIRST row stands
    expect(r.refused).toHaveLength(1)
    expect(r.refused[0].reason).toContain('appears more than once')
  })

  it('ignores unknown columns rather than failing', () => {
    const r = parseSuppliersCsv('Name,Type,Favourite Colour\nNile Star,hotel,green')
    expect(r.records[0]).not.toHaveProperty('favourite_colour')
  })

  it('an empty file is a parseError, not a silent success', () => {
    expect(parseSuppliersCsv('Name,Type\n').parseError).toBe('No data rows')
  })
})

describe('splitAgainstExisting', () => {
  it('skips existing tenant suppliers case-insensitively — an import creates, never updates', () => {
    const { records } = parseSuppliersCsv(
      ['Name,Type', 'Nile Star,hotel', 'New Kid,guide'].join('\n')
    )
    const { toInsert, skippedExisting } = splitAgainstExisting(records, ['  NILE STAR '])
    expect(skippedExisting).toEqual(['Nile Star'])
    expect(toInsert.map(r => r.name)).toEqual(['New Kid'])
  })
})

describe('the suppliers Sample CSV is the contract', () => {
  it("the sample's own example row imports with a real type and zero refusals", () => {
    // Mirrors handleSampleCsv in app/suppliers/suppliers-content.tsx.
    const sample = [
      'Name,Type,Contact,Email,Phone,City,Country,Commission,Status,Notes,Website',
      'Nile Star Hotel,hotel,Ahmed Hassan,reservations@nilestar.example,+20 100 000 0000,Cairo,Egypt,10,active,Valid types: hotel | airline,https://nilestar.example',
    ].join('\n')
    const r = parseSuppliersCsv(sample)
    expect(r.refused).toEqual([])
    expect(r.typeDefaulted).toEqual([])
    expect(r.records[0]).toMatchObject({
      name: 'Nile Star Hotel',
      type: 'hotel',
      contact_name: 'Ahmed Hassan',
      city: 'Cairo',
      default_commission_rate: 10,
      status: 'active',
    })
  })

  it('the sample page markup actually offers the sample download', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'app', 'suppliers', 'suppliers-content.tsx'), 'utf8')
    expect(src).toContain('suppliers_sample.csv')
    expect(src).toContain('Sample CSV')
  })
})


// A supplier can fill several roles (migration 340): the Type cell lists them.
describe('several roles per row', () => {
  const VOCAB = [
    { key: 'hotel', label: 'Hotel' },
    { key: 'transport_company', label: 'Fleet partner' },
    { key: 'ground_handler', label: 'Ground handler' },
    { key: 'other', label: 'Other' },
  ]

  it('splits the Type cell on | ; or /, slugified, first = primary', () => {
    expect(splitTypes('Hotel | Transport company; ground-handler')).toEqual(['hotel', 'transport_company', 'ground_handler'])
    expect(splitTypes('hotel/hotel')).toEqual(['hotel'])
    expect(splitTypes('')).toEqual(['other'])
    const r = parseSuppliersCsv([EXPORT_HEADERS, 'Sabena Group,cruise|hotel,,,,Luxor,,active'].join('\n'))
    expect(r.records[0]).toMatchObject({ type: 'cruise', types: ['cruise', 'hotel'] })
  })

  it("resolves the agency's own words (labels) to keys and keeps the primary first", () => {
    const parsed = parseSuppliersCsv([EXPORT_HEADERS, 'Nile Fleet,Fleet partner | Hotel,,,,Cairo,,active'].join('\n'))
    const { records, refused } = resolveImportTypes(parsed.records, VOCAB)
    expect(refused).toEqual([])
    expect(records[0]).toMatchObject({ type: 'transport_company', types: ['transport_company', 'hotel'] })
  })

  it('refuses a row naming a role the agency does not have, and says which', () => {
    const parsed = parseSuppliersCsv([EXPORT_HEADERS, 'Mystery Co,hotel|spaceship,,,,Cairo,,active', 'Fine Co,hotel,,,,Cairo,,active'].join('\n'))
    const { records, refused } = resolveImportTypes(parsed.records, VOCAB)
    expect(records.map(r => r.name)).toEqual(['Fine Co'])
    expect(refused).toEqual([{ row: 2, reason: expect.stringMatching(/"Mystery Co": type "spaceship" is not in your supplier types/) }])
  })

  it('passes records through untouched when the vocabulary is empty (migration not applied)', () => {
    const parsed = parseSuppliersCsv([EXPORT_HEADERS, 'Any Co,whatever,,,,Cairo,,active'].join('\n'))
    expect(resolveImportTypes(parsed.records, []).records[0].types).toEqual(['whatever'])
  })
})
