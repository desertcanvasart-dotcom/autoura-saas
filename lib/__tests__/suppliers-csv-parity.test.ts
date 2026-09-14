// ============================================
// Nothing a supplier form collects may fall out of the CSV (2026-09-14)
// ============================================
// The export button, the Sample CSV, the importer's header map and this suite
// each carried their own hand-written copy of the supplier column set. Nothing
// forced them to agree, and they drifted: the export wrote 8 columns while the
// importer understood 12, so exporting a supplier and importing it back lost
// its code, country, notes, website — and every property it operates.
//
// The four lists are now one (lib/suppliers/csv-schema.ts). These tests are
// what keeps them one: the rule is not "17 columns exist", it is "every field
// the FORM collects survives a round-trip", checked against the form itself.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SUPPLIER_CSV_COLUMNS,
  SUPPLIER_CSV_HEADERS,
  SUPPLIER_EXPORT_SELECT,
  supplierCsvHeaderMap,
  supplierCsvSampleRow,
  normalizeHeader,
  parsePropertiesCell,
  formatPropertiesCell,
} from '@/lib/suppliers/csv-schema'
import { parseSuppliersCsv } from '@/lib/suppliers/import-csv'

const ROOT = join(__dirname, '..', '..')
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8')
const PAGE = read('app', 'suppliers', 'suppliers-content.tsx')

const fields = new Set(SUPPLIER_CSV_COLUMNS.map(c => c.field))

describe('every field the supplier form collects survives the CSV', () => {
  // The form's own field list, read from the page — not a copy of it. A new
  // form field fails this test until the schema learns it.
  const formFields = [...PAGE.slice(PAGE.indexOf('const getFormFields ='), PAGE.indexOf('const handleSubmit'))
    .matchAll(/key: '([a-z_0-9]+)'/g)].map(m => m[1])

  it('found the form fields to check against', () => {
    expect(formFields.length).toBeGreaterThan(8)
    expect(formFields).toContain('name')
  })

  for (const field of [...new Set(formFields)]) {
    it(`${field} has a CSV column`, () => {
      // `types` is the multi-role picker; the CSV carries it in the Type cell.
      const csvField = field === 'types' ? 'type' : field
      expect(fields.has(csvField), `the form collects ${field} but no CSV column carries it`).toBe(true)
    })
  }
})

describe('the export, the Sample CSV and the importer read one list', () => {
  it('the page builds both files from the schema, not from literals', () => {
    expect(PAGE).toMatch(/SUPPLIER_CSV_HEADERS/)
    expect(PAGE).toMatch(/supplierCsvSampleRow/)
    // The old hand-written header lines must not come back.
    expect(PAGE).not.toMatch(/'Name', 'Type', 'Contact'/)
    expect(PAGE).not.toMatch(/'Name,Type,Contact/)
  })

  it('the importer understands every header the export writes', () => {
    const map = supplierCsvHeaderMap()
    for (const header of SUPPLIER_CSV_HEADERS) {
      expect(map[normalizeHeader(header)], `the export writes "${header}" and the importer ignores it`).toBeDefined()
    }
  })

  it('the export query selects every field it intends to write', () => {
    const selected = new Set(SUPPLIER_EXPORT_SELECT.split(',').map(c => c.trim()))
    for (const column of SUPPLIER_CSV_COLUMNS) {
      if (column.virtual) continue
      expect(selected.has(column.field), `${column.field} is exported but not selected`).toBe(true)
    }
    // select('*') is ratcheted down in this repo; the list must stay explicit.
    expect(SUPPLIER_EXPORT_SELECT).not.toContain('*')
  })

  it('the sample row has exactly one cell per header', () => {
    expect(supplierCsvSampleRow('hotel')).toHaveLength(SUPPLIER_CSV_HEADERS.length)
  })

  it('an exported row parses back into the fields it came from', () => {
    const values: Record<string, string> = {
      name: 'Nile Star Hotel', supplier_code: 'SUP-0042', type: 'hotel|transport_company',
      contact_name: 'Ahmed', contact_email: 'a@nilestar.eg', contact_phone: '+20100000000',
      phone2: '+20111111111', whatsapp: '+20122222222', website: 'https://nilestar.example',
      address: '12 Corniche', city: 'Cairo', country: 'Egypt', commission_type: 'percentage',
      default_commission_rate: '10', status: 'active', notes: 'Contracted 2026',
      properties: 'hotel:Nile Star Cairo | hotel:Nile Star Luxor',
    }
    const csv = [
      SUPPLIER_CSV_HEADERS.join(','),
      SUPPLIER_CSV_COLUMNS.map(c => `"${values[c.field] ?? ''}"`).join(','),
    ].join('\n')
    const record = parseSuppliersCsv(csv).records[0]

    expect(record).toMatchObject({
      name: 'Nile Star Hotel', supplier_code: 'SUP-0042',
      contact_name: 'Ahmed', contact_email: 'a@nilestar.eg', contact_phone: '+20100000000',
      phone2: '+20111111111', whatsapp: '+20122222222', website: 'https://nilestar.example',
      address: '12 Corniche', city: 'Cairo', country: 'Egypt', commission_type: 'percentage',
      default_commission_rate: 10, status: 'active', notes: 'Contracted 2026',
    })
    expect(record.types).toEqual(['hotel', 'transport_company'])
    expect(record.properties?.map(p => `${p.type}:${p.name}`)).toEqual([
      'hotel:Nile Star Cairo', 'hotel:Nile Star Luxor',
    ])
    // The raw cell must never survive as a scalar — `suppliers` has no such column.
    expect(typeof (record as Record<string, unknown>).properties).not.toBe('string')
  })
})

describe('the Properties cell', () => {
  it('round-trips what the export writes', () => {
    const properties = [
      { property_type: 'ship', name: 'MS Hapi' },
      { property_type: 'hotel', name: 'Nile Star' },
    ]
    const parsed = parsePropertiesCell(formatPropertiesCell(properties))
    expect(parsed).toEqual([
      { type: 'ship', rawType: 'ship', name: 'MS Hapi' },
      { type: 'hotel', rawType: 'hotel', name: 'Nile Star' },
    ])
  })

  it('round-trips a name that contains a colon, because the export types it', () => {
    // The export ALWAYS writes "type:Name", so a colon inside the name is
    // unambiguous on the way back in.
    const cell = formatPropertiesCell([{ property_type: 'hotel', name: 'Sunset: The Nile Suite' }])
    expect(cell).toBe('hotel:Sunset: The Nile Suite')
    expect(parsePropertiesCell(cell)).toEqual([
      { type: 'hotel', rawType: 'hotel', name: 'Sunset: The Nile Suite' },
    ])
  })

  it('reports an untyped prefix that looks like a type rather than guessing', () => {
    // The two readings of "boat:MS Hapi" — a typo for ship, or a property
    // genuinely named that — cannot both be honoured. Reporting it is the only
    // one that never writes data the user did not mean: treating it as a name
    // would silently create a property called "boat:MS Hapi" that nobody asked
    // for and nobody would notice. A name that really does start that way is
    // written with its type ("hotel:boat:MS Hapi"), which the test above pins.
    expect(parsePropertiesCell('boat:MS Hapi')).toEqual([
      { type: null, rawType: 'boat', name: 'MS Hapi' },
    ])
  })

  it('accepts a bare name for the route to place by the supplier\'s roles', () => {
    expect(parsePropertiesCell('MS Hapi')).toEqual([{ type: null, rawType: null, name: 'MS Hapi' }])
  })

  it('never splits on a slash — "Cairo/Giza Express" is one train', () => {
    expect(parsePropertiesCell('train:Cairo/Giza Express')).toEqual([
      { type: 'train', rawType: 'train', name: 'Cairo/Giza Express' },
    ])
  })

  it('ignores empty entries and trims', () => {
    expect(parsePropertiesCell(' ship:MS Hapi | | ;  ')).toEqual([
      { type: 'ship', rawType: 'ship', name: 'MS Hapi' },
    ])
    expect(parsePropertiesCell('')).toEqual([])
    expect(parsePropertiesCell(null)).toEqual([])
  })

  it('a supplier with no properties exports a blank cell, not the word undefined', () => {
    expect(formatPropertiesCell([])).toBe('')
    expect(formatPropertiesCell([{ property_type: 'ship', name: '  ' }])).toBe('')
  })
})

describe('the export is built by the server, where the properties are', () => {
  const route = read('app', 'api', 'suppliers', 'export', 'route.ts')

  it('joins supplier_properties rather than guessing', () => {
    expect(route).toMatch(/from\('supplier_properties'\)/)
    expect(route).toMatch(/formatPropertiesCell/)
  })

  it('serialises with Papa, not with hand-built quotes', () => {
    // `"${v || ''}"` corrupted any supplier whose name contained a quote.
    expect(route).toMatch(/Papa\.unparse/)
    expect(PAGE).not.toMatch(/\.map\(v => `"\$\{v \|\| ''\}"`\)/)
  })

  it('scopes to the tenant explicitly as well as through RLS', () => {
    expect(route).toMatch(/\.eq\('tenant_id', tenant_id\)/)
  })
})
