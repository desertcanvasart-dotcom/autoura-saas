// ============================================
// The property survives the CSV round-trip (2026-09-14)
// ============================================
// Reported from the Trains rates page: export the rates, delete them, import
// the very same file back — and every row returns with no train on it. The
// cause was that `property_id` (WHICH ship, WHICH hotel, WHICH train) was in
// four rate tables and in none of their CSV configs, so the export never wrote
// it and the import never read it. Trains showed it first because a train's
// name lives ONLY on supplier_properties: hotels and cruises keep a
// denormalized property_name/ship_name on the rate row, so their text survived
// and only the silent link was lost.
//
// The link travels as the property's NAME — (supplier_id, property_type, name)
// is supplier_properties' own unique key (migration 311) — never as a UUID,
// which means nothing in another install.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { RATE_TABLE_CONFIGS, RATE_PROPERTY_LINK, propertyLinkFor, getExportHeaders, getTemplateHeaders } from '@/lib/bulk-rate-service'

const ROOT = join(__dirname, '..', '..')
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8')

/** Rate tables the migrations gave a property_id FK. */
const TABLES_WITH_PROPERTY_FK = ['311_supplier_properties', '312_supplier_properties_hotels', '313_supplier_properties_trains']
  .flatMap(m => [...read('supabase', 'migrations', `${m}.sql`)
    .matchAll(/ALTER TABLE (\w+)\s+ADD COLUMN IF NOT EXISTS property_id/g)].map(m2 => m2[1]))
  .filter(t => t in RATE_TABLE_CONFIGS)

describe('every rate table with a property_id declares its CSV link', () => {
  it('found the four the migrations created', () => {
    expect([...TABLES_WITH_PROPERTY_FK].sort()).toEqual(
      ['accommodation_rates', 'nile_cruises', 'sleeping_train_rates', 'train_rates']
    )
  })

  for (const table of TABLES_WITH_PROPERTY_FK) {
    it(`${table} names the column carrying the property's name`, () => {
      const link = propertyLinkFor(table)
      expect(link, `${table} has property_id but no RATE_PROPERTY_LINK entry`).not.toBeNull()
      // The name column must be a real config column, or neither half can see it.
      expect(getExportHeaders(RATE_TABLE_CONFIGS[table])).toContain(link!.nameColumn)
      // And on the Sample CSV, or nobody filling one in by hand can set it.
      expect(getTemplateHeaders(RATE_TABLE_CONFIGS[table])).toContain(link!.nameColumn)
    })
  }

  it('hotels and cruises reuse the name already on the rate row', () => {
    expect(RATE_PROPERTY_LINK.accommodation_rates).toEqual({ propertyType: 'hotel', nameColumn: 'property_name', virtual: false })
    expect(RATE_PROPERTY_LINK.nile_cruises).toEqual({ propertyType: 'ship', nameColumn: 'ship_name', virtual: false })
  })

  it('trains have no such column, so theirs is virtual and importable', () => {
    for (const table of ['train_rates', 'sleeping_train_rates']) {
      const link = RATE_PROPERTY_LINK[table]
      expect(link.virtual, `${table} has no train-name column of its own`).toBe(true)
      const colDef = RATE_TABLE_CONFIGS[table].columns.find(c => c.name === link.nameColumn)!
      expect(colDef.required, `${table} ${link.nameColumn} must be optional`).toBe(false)
      expect(colDef.exportOnly ?? false, `${table} ${link.nameColumn} must be importable`).toBe(false)
    }
  })

  it('a virtual column is never a natural key — it is not stored', () => {
    for (const [table, link] of Object.entries(RATE_PROPERTY_LINK)) {
      if (!link.virtual) continue
      expect(RATE_TABLE_CONFIGS[table].uniqueKey).not.toContain(link.nameColumn)
    }
  })
})

describe('both halves of the round-trip are wired', () => {
  it('the export joins supplier_properties to name a virtual property', () => {
    const route = read('app', 'api', 'rates', 'bulk', 'export', 'route.ts')
    expect(route).toMatch(/propertyLinkFor\(table\)/)
    expect(route).toMatch(/from\('supplier_properties'\)/)
    expect(route).toMatch(/\[propertyLink\.nameColumn\]/)
  })

  it('the import resolves the name to a property under the row\'s own supplier', () => {
    const route = read('app', 'api', 'rates', 'bulk', 'import', 'route.ts')
    expect(route).toMatch(/resolveRateProperty/)
    expect(route).toMatch(/propertyType: link\.propertyType/)
    // Must run AFTER supplier resolution, or it hangs properties off the
    // foreign install's UUID instead of this tenant's supplier.
    expect(route.indexOf('resolveRateProperty(supabase')).toBeGreaterThan(route.indexOf('supplierLinksCleared'))
  })

  it('the virtual column is stripped before the insert', () => {
    // No train table has a property_name column — leaving it on the record
    // fails the whole batch on an unknown column.
    expect(read('app', 'api', 'rates', 'bulk', 'import', 'route.ts'))
      .toMatch(/if \(link\.virtual\) for \(const r of rowsToUpsert\) delete r\[link\.nameColumn\]/)
  })

  it('a property that could not be linked is reported, not swallowed', () => {
    expect(read('app', 'api', 'rates', 'bulk', 'import', 'route.ts')).toMatch(/propertyLinksUnresolved/)
    expect(read('app', 'components', 'BulkRateImportExport.tsx')).toMatch(/propertyLinksUnresolved/)
  })
})

// ============================================
// The same audit, widened: no LINK column may fall out of a CSV
// ============================================
// Hunting the property bug turned up the same shape on supplier_id — hotels,
// airport services, hotel services and the extras catalogue each stored a
// supplier the CSV never carried, so every export → import quietly unlinked
// them. (Hotels mattered twice over: with no supplier on the row there was
// nothing to resolve the property under.) A link the database keeps and the
// sheet forgets is invisible until somebody round-trips their data, so this
// reads the generated types and fails the moment a rate table has a link
// column its CSV config does not.
describe('every link column a rate table stores travels in its CSV', () => {
  const types = read('types', 'database.types.ts')

  /** The Row block's column names for one table in the generated types. */
  function dbColumns(table: string): Set<string> | null {
    const start = types.indexOf(`      ${table}: {`)
    if (start < 0) return null
    const segment = types.slice(start, start + 20000)
    const row = segment.slice(segment.indexOf('Row: {'), segment.indexOf('Insert: {'))
    return new Set(row.split('\n').map(l => l.trim().split(':')[0]))
  }

  for (const [table, cfg] of Object.entries(RATE_TABLE_CONFIGS)) {
    it(`${table} carries every link it stores`, () => {
      const stored = dbColumns(cfg.tableName)
      if (!stored) return // table not in the generated types (nothing to check)
      const csv = new Set(cfg.columns.map(c => c.name))
      for (const link of ['supplier_id', 'property_id']) {
        if (!stored.has(link)) continue
        // property_id travels as the property's NAME, never the UUID.
        const carried = link === 'property_id'
          ? propertyLinkFor(table) !== null && csv.has(propertyLinkFor(table)!.nameColumn)
          : csv.has(link)
        expect(carried, `${table} stores ${link} but its CSV config drops it — a round-trip would unlink every row`).toBe(true)
      }
    })
  }
})
