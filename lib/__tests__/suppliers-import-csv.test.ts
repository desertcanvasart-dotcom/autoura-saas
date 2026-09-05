import { describe, it, expect } from 'vitest'
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

  it('refuses rows missing the identity (Name / Type) with the reason named', () => {
    const r = parseSuppliersCsv(['Name,Type', ',hotel', 'Ghost Lodge,'].join('\n'))
    expect(r.records).toEqual([])
    expect(r.refused).toEqual([
      { row: 2, reason: 'missing Name' },
      { row: 3, reason: '"Ghost Lodge" has no Type' },
    ])
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
