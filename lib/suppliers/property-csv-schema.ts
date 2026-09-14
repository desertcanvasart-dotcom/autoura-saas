// ============================================
// The properties CSV — every asset, in full, editable in a spreadsheet
// ============================================
// The suppliers CSV carries each supplier's properties as NAMES in one cell
// ("hotel:Nile Star | ship:MS Hapi"). That round-trips the link, which is all
// it can honestly do: a property also has a city, a category, an accommodation
// type and its own contacts, and nesting a record inside a CSV cell makes a
// file nobody can edit by hand.
//
// So the detail gets its own sheet: one ROW per property, which is the shape a
// spreadsheet is actually good at (2026-09-14, on the request to bulk-edit
// property details in Excel).
//
// ── Identity, and why there are three ways to find a row ────────────────────
// 1. `Property ID` — exported on every row. When present it WINS, which is the
//    only way a RENAME can work: change the Name cell and the row still points
//    at the same property.
// 2. Otherwise (supplier, kind, name) — supplier_properties' own unique key
//    (migration 311). This is what lets somebody write a sheet from scratch.
// 3. No match on either — the row CREATES a property.
//
// ── What this sheet will never do ───────────────────────────────────────────
// DELETE. A property missing from the file is left alone: the export can be
// filtered to a handful of suppliers, and "absent means delete" would turn a
// filtered export into a wipe. Retiring a property is `Active = false`, which
// is explicit, visible in the sheet, and reversible.

import { PROPERTY_TYPES, type PropertyType } from '@/lib/supplier-properties'

export interface PropertyCsvColumn {
  header: string
  field: string
  aliases?: readonly string[]
  /** Written on export, never read back as a value to store. */
  readOnly?: boolean
  sample: string
}

export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, '_')
}

// Order here is the order of the exported file.
export const PROPERTY_CSV_COLUMNS: readonly PropertyCsvColumn[] = [
  // Identity of the row itself. Blank on a hand-written sheet; that is fine.
  { header: 'Property ID', field: 'id', aliases: ['property_id'], readOnly: true, sample: '' },
  // How the row finds its supplier. The CODE is the portable key; the name is
  // the human's way in, and the fallback when a sheet carries no codes.
  { header: 'Supplier Code', field: 'supplier_code', aliases: ['code'], sample: 'SUP-0001' },
  { header: 'Supplier', field: 'supplier_name', aliases: ['supplier'], sample: 'Nile Star Group' },
  { header: 'Kind', field: 'property_type', aliases: ['property_type', 'type'], sample: 'hotel' },
  { header: 'Name', field: 'name', aliases: ['property_name'], sample: 'Nile Star Cairo' },
  { header: 'City', field: 'city', sample: 'Cairo' },
  { header: 'Category', field: 'category', sample: '5*' },
  // Hotels only — the agency's own accommodation-type word (Settings → Your
  // vocabulary). Resolved to its key on import; an unknown word refuses the row
  // rather than writing a value the rest of the app cannot read.
  { header: 'Accommodation Type', field: 'accommodation_type', aliases: ['accommodation'], sample: '' },
  { header: 'Contact Name', field: 'contact_name', aliases: ['contact'], sample: '' },
  { header: 'Contact Phone', field: 'contact_phone', aliases: ['phone'], sample: '' },
  { header: 'Contact Email', field: 'contact_email', aliases: ['email'], sample: '' },
  { header: 'Notes', field: 'notes', sample: '' },
  { header: 'Active', field: 'is_active', aliases: ['status'], sample: 'true' },
] as const

export const PROPERTY_CSV_HEADERS: readonly string[] = PROPERTY_CSV_COLUMNS.map(c => c.header)

/** The columns actually stored on supplier_properties, for the export SELECT. */
export const PROPERTY_EXPORT_SELECT: string = [
  'id', 'supplier_id', 'property_type', 'name', 'city', 'category',
  'accommodation_type', 'contact_name', 'contact_phone', 'contact_email',
  'notes', 'is_active',
].join(', ')

/** The fields a row may write. `id` identifies, it is never written. */
export const PROPERTY_WRITABLE_FIELDS = [
  'property_type', 'name', 'city', 'category', 'accommodation_type',
  'contact_name', 'contact_phone', 'contact_email', 'notes', 'is_active',
] as const

export function propertyCsvHeaderMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const column of PROPERTY_CSV_COLUMNS) {
    map[normalizeHeader(column.header)] = column.field
    map[normalizeHeader(column.field)] = column.field
    for (const alias of column.aliases ?? []) map[normalizeHeader(alias)] = column.field
  }
  return map
}

export function propertyCsvSampleRow(): string[] {
  return PROPERTY_CSV_COLUMNS.map(c => c.sample)
}

/** Is this a kind of property this system knows? */
export function asPropertyType(value: string | null | undefined): PropertyType | null {
  const v = String(value ?? '').trim().toLowerCase()
  return (PROPERTY_TYPES as readonly string[]).includes(v) ? (v as PropertyType) : null
}

/**
 * Spreadsheets are inconsistent about booleans — Excel writes TRUE, a human
 * writes yes, an export writes true. Anything unrecognised is NOT quietly
 * treated as false: it returns null so the caller can refuse the cell rather
 * than deactivating a property because somebody typed "y".
 */
export function parseBooleanCell(value: string | null | undefined): boolean | null {
  const v = String(value ?? '').trim().toLowerCase()
  if (v === '') return null
  if (['true', 'yes', 'y', '1', 'active'].includes(v)) return true
  if (['false', 'no', 'n', '0', 'inactive'].includes(v)) return false
  return null
}
