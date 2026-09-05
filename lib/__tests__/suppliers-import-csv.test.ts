import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSuppliersCsv, splitAgainstExisting } from '@/lib/suppliers/import-csv'

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
