// ============================================
// The suppliers CSV schema — ONE list, four readers
// ============================================
// The export button, the Sample CSV, the importer's header map and the tests
// each carried their own hand-written copy of the column set. Nothing forced
// them to agree, so they drifted: the export wrote 8 columns while the importer
// understood 12, and the properties a user had entered by hand had no column at
// all. Exporting, deleting and re-importing silently dropped the supplier's
// code, country, notes, website, phone 2, WhatsApp, address, commission type —
// and every ship, hotel and train they operate (reported 2026-09-14).
//
// The worst of those was the CODE. supplier_code is the portable cross-install
// key (SUP-0001) that rate CSVs link suppliers by; a round-trip that loses it
// hands every supplier a NEW code and orphans the rate files pointing at them.
//
// So the column set lives here once and everything derives from it. Adding a
// field to the supplier form is now a single entry in this list, and
// suppliers-csv-parity.test.ts fails until it is made.
//
// ── The invariant ───────────────────────────────────────────────────────────
// Every field the supplier FORM collects must survive a round-trip. That is the
// rule the parity test enforces against getFormFields() in the page itself —
// not a fixed list of columns somebody has to remember to update.

import { PROPERTY_TYPES, type PropertyType } from '@/lib/supplier-properties'

export interface SupplierCsvColumn {
  /** Exact header written by the export and the Sample CSV. */
  header: string
  /** The record/supplier field this column carries. */
  field: string
  /** Extra header spellings accepted on import, already normalized. */
  aliases?: readonly string[]
  /** Not a column on `suppliers` — resolved separately (see `properties`). */
  virtual?: boolean
  /** The cell the Sample CSV shows for this column. */
  sample: string
}

/** Header as the importer sees it: trimmed, lowercased, spaces → underscores. */
export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, '_')
}

// Order here is the order of the exported file.
export const SUPPLIER_CSV_COLUMNS: readonly SupplierCsvColumn[] = [
  { header: 'Name', field: 'name', aliases: ['company', 'company_name', 'supplier', 'supplier_name'], sample: 'Nile Star Hotel' },
  // The portable cross-install key. Second so it sits beside the name it identifies.
  { header: 'Code', field: 'supplier_code', aliases: ['supplier_code'], sample: 'SUP-0001' },
  { header: 'Type', field: 'type', aliases: ['supplier_type', 'category'], sample: 'hotel|transport_company' },
  { header: 'Contact', field: 'contact_name', aliases: ['contact_name'], sample: 'Ahmed Hassan' },
  { header: 'Email', field: 'contact_email', aliases: ['contact_email'], sample: 'reservations@nilestar.example' },
  { header: 'Phone', field: 'contact_phone', aliases: ['contact_phone'], sample: '+20 100 000 0000' },
  { header: 'Phone 2', field: 'phone2', aliases: ['phone_2', 'second_phone'], sample: '' },
  // A real column now. It ALSO still falls back into Phone when Phone is blank
  // (see parseSuppliersCsv) — for many suppliers WhatsApp is the only number.
  { header: 'WhatsApp', field: 'whatsapp', aliases: ['whats_app'], sample: '' },
  { header: 'Website', field: 'website', sample: 'https://nilestar.example' },
  { header: 'Address', field: 'address', sample: '' },
  { header: 'City', field: 'city', sample: 'Cairo' },
  { header: 'Country', field: 'country', sample: 'Egypt' },
  { header: 'Commission Type', field: 'commission_type', aliases: ['commission_kind'], sample: '' },
  { header: 'Commission', field: 'default_commission_rate', aliases: ['default_commission_rate'], sample: '10' },
  { header: 'Status', field: 'status', sample: 'active' },
  { header: 'Notes', field: 'notes', sample: '' },
  // The assets the supplier operates. Virtual: they are rows in
  // supplier_properties, resolved by the import route under this supplier.
  { header: 'Properties', field: 'properties', virtual: true, sample: 'hotel:Nile Star Hotel' },
] as const

/** Headers, in export order. */
export const SUPPLIER_CSV_HEADERS: readonly string[] = SUPPLIER_CSV_COLUMNS.map(c => c.header)

/**
 * Every header spelling the importer accepts → the field it fills. Derived, so
 * a column added above is understood on import without a second edit.
 */
export function supplierCsvHeaderMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const column of SUPPLIER_CSV_COLUMNS) {
    map[normalizeHeader(column.header)] = column.field
    map[normalizeHeader(column.field)] = column.field
    for (const alias of column.aliases ?? []) map[normalizeHeader(alias)] = column.field
  }
  return map
}

/**
 * The `suppliers` columns the export must read — derived from the same list, so
 * a new column cannot be exported-but-unselected. `select('*')` would have done
 * it, but this codebase ratchets those down: naming the columns is both the
 * house rule and a guard that the query says what it means.
 *
 * `id` and `types` are not CSV columns of their own — the id keys the property
 * lookup, and `types` backs the Type column (a supplier fills several roles).
 */
export const SUPPLIER_EXPORT_SELECT: string = [
  'id',
  'types',
  ...SUPPLIER_CSV_COLUMNS.filter(c => !c.virtual).map(c => c.field),
].filter((f, i, all) => all.indexOf(f) === i).join(', ')

/** The Sample CSV's single example row, in header order. */
export function supplierCsvSampleRow(validTypes: string): string[] {
  return SUPPLIER_CSV_COLUMNS.map(c => (c.field === 'type' ? validTypes : c.sample))
}

// ── Properties cell ──────────────────────────────────────────────────────────
// One supplier, many assets, one flat row: the cell lists them type-qualified
// and pipe-separated — "ship:MS Hapi | hotel:Nile Star". The NAME is the key
// that matters: (supplier_id, property_type, name) is supplier_properties' own
// unique constraint (migration 311), so a name round-trips to exactly the same
// property. Per-property detail (city, category, contacts) is deliberately NOT
// squeezed in here — it belongs to the property's own record, and inventing a
// nested encoding inside a CSV cell would make a file nobody can edit by hand.
//
// Split on | and ; only, never on / — "Cairo/Giza Express" is one train.

const PROPERTY_SEPARATOR = /[|;]/

export interface ParsedPropertyEntry {
  /** The resolved property type, or null when the prefix named none. */
  type: PropertyType | null
  /** What the cell actually said before the colon, for an honest error. */
  rawType: string | null
  name: string
}

/** "ship:MS Hapi | hotel:Nile Star" → entries, preserving what was written. */
export function parsePropertiesCell(cell: string | null | undefined): ParsedPropertyEntry[] {
  const out: ParsedPropertyEntry[] = []
  for (const part of String(cell ?? '').split(PROPERTY_SEPARATOR)) {
    const piece = part.trim()
    if (!piece) continue
    // Split on the FIRST colon only, and only when the prefix is a real
    // property type — a property genuinely called "Sunset: The Nile Suite"
    // keeps its colon instead of being mangled into a bogus type.
    const colon = piece.indexOf(':')
    if (colon > 0) {
      const prefix = piece.slice(0, colon).trim().toLowerCase()
      const rest = piece.slice(colon + 1).trim()
      if (rest && (PROPERTY_TYPES as readonly string[]).includes(prefix)) {
        out.push({ type: prefix as PropertyType, rawType: prefix, name: rest })
        continue
      }
      // A prefix that LOOKS like a type but is not one is reported, never
      // folded into the name. The two readings of "boat:MS Hapi" — a typo for
      // ship, or a property genuinely called that — cannot both be honoured;
      // reporting is the only reading that never writes data nobody asked for.
      // A name that really does begin that way keeps its own type prefix
      // ("hotel:boat:MS Hapi"), which is exactly what the export writes.
      if (rest && /^[a-z_]{3,12}$/.test(prefix)) {
        out.push({ type: null, rawType: prefix, name: rest })
        continue
      }
    }
    out.push({ type: null, rawType: null, name: piece })
  }
  return out
}

/** Properties → the cell the export writes. */
export function formatPropertiesCell(
  properties: readonly { property_type: string; name: string }[]
): string {
  return properties
    .filter(p => String(p.name ?? '').trim() !== '')
    .map(p => `${p.property_type}:${String(p.name).trim()}`)
    .join(' | ')
}
