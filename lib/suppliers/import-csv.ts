// ============================================
// Suppliers CSV import — pure parsing/classification (B-item 7)
// ============================================
// The suppliers page could export but never import. The format is the
// export's own: Name, Type, Contact, Email, Phone, City, Commission,
// Status (headers case-insensitive; unknown columns ignored), so an
// exported file round-trips.
//
// The natural-key doctrine (A-item 5) applies:
//   - two rows in one file sharing a name → the later rows are REFUSED
//     with the collision named, never last-row-wins;
//   - a supplier that already exists (same name, case-insensitive, in
//     the tenant) is SKIPPED and reported — an import CREATES, it never
//     silently updates.
//
// Type is NOT identity: a row without one imports as 'other' and is
// REPORTED, not refused — a real list of 64 suppliers with no Type column
// should land as unclassified rows to reclassify, not bounce 64 times
// (which is exactly what happened on first use).

import Papa from 'papaparse'
import { resolveVocabularyKey } from '@/lib/vocabulary'

// A supplier can fill SEVERAL roles (migration 340): the Type cell may list
// them separated by | ; or / — "hotel | transport company" — in the agency's
// keys or labels. resolveImportTypes() turns the words into vocabulary keys
// and REFUSES a row naming a role the agency does not have, so a typo never
// lands as a bogus type (the database would refuse it anyway, as a 500).

const HEADER_MAP: Record<string, string> = {
  name: 'name',
  company: 'name',
  company_name: 'name',
  supplier: 'name',
  supplier_name: 'name',
  // The portable cross-install key (SUP-0001). Carried through so importing a
  // supplier export into a fresh tenant creates suppliers WITH their codes, and
  // rate CSVs then link by code with no separate reconciliation step.
  code: 'supplier_code',
  supplier_code: 'supplier_code',
  type: 'type',
  supplier_type: 'type',
  category: 'type',
  contact: 'contact_name',
  contact_name: 'contact_name',
  email: 'contact_email',
  contact_email: 'contact_email',
  phone: 'contact_phone',
  contact_phone: 'contact_phone',
  city: 'city',
  country: 'country',
  commission: 'default_commission_rate',
  default_commission_rate: 'default_commission_rate',
  status: 'status',
  notes: 'notes',
  website: 'website',
}

export interface SupplierImportRecord {
  /** 1-based CSV line (header is line 1). */
  row: number
  name: string
  /** Portable supplier code (SUP-0001) from the other install, when the sheet carries it. */
  supplier_code?: string
  /** The PRIMARY role (types[0]). */
  type: string
  /** Every role the Type cell named, as slugs (or vocabulary keys after resolveImportTypes). */
  types: string[]
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  city?: string
  country?: string
  default_commission_rate?: number
  status?: string
  notes?: string
  website?: string
}

export interface SupplierImportParseResult {
  totalRows: number
  records: SupplierImportRecord[]
  refused: Array<{ row: number; reason: string }>
  /** Names imported with type 'other' because the row named no type. */
  typeDefaulted: string[]
  /** Fatal CSV syntax errors — nothing was parsed. */
  parseError?: string
}

export function parseSuppliersCsv(csvData: string): SupplierImportParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvData, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })
  if (parsed.errors.length > 0) {
    return {
      totalRows: 0,
      records: [],
      refused: [],
      typeDefaulted: [],
      parseError: `CSV parsing failed: ${parsed.errors[0].message}`,
    }
  }
  if (parsed.data.length === 0) {
    return { totalRows: 0, records: [], refused: [], typeDefaulted: [], parseError: 'No data rows' }
  }

  const refused: Array<{ row: number; reason: string }> = []
  const records: SupplierImportRecord[] = []
  const typeDefaulted: string[] = []
  const seenNames = new Set<string>()

  parsed.data.forEach((raw, i) => {
    const rowNum = i + 2 // header is row 1
    const record: Record<string, string | number> = {}
    for (const [header, value] of Object.entries(raw)) {
      const field = HEADER_MAP[header]
      if (!field) continue
      const v = (value ?? '').trim()
      if (v === '') continue
      record[field] = field === 'default_commission_rate' ? Number(v) || 0 : v
    }
    const name = String(record.name ?? '').trim()
    if (!name) {
      refused.push({ row: rowNum, reason: 'missing Name' })
      return
    }
    if (!record.type) {
      // Type is not identity — import as 'other' and say so.
      record.type = 'other'
      typeDefaulted.push(name)
    }
    const key = name.toLowerCase()
    if (seenNames.has(key)) {
      refused.push({
        row: rowNum,
        reason: `"${name}" appears more than once in this file — the second row would silently shadow the first`,
      })
      return
    }
    seenNames.add(key)
    const types = splitTypes(String(record.type))
    records.push({
      ...(record as Omit<SupplierImportRecord, 'row' | 'name' | 'type' | 'types'>),
      row: rowNum,
      name,
      type: types[0],
      types,
    })
  })

  return { totalRows: parsed.data.length, records, refused, typeDefaulted }
}

/** "Hotel | Transport company; ground_handler" → ['hotel', 'transport_company', 'ground_handler']. */
export function splitTypes(cell: string): string[] {
  const out: string[] = []
  for (const part of String(cell ?? '').split(/[|;/]/)) {
    const slug = part.trim().toLowerCase().replace(/[\s-]+/g, '_')
    if (slug && !out.includes(slug)) out.push(slug)
  }
  return out.length ? out : ['other']
}

/**
 * Turn each record's role words into the agency's vocabulary keys. A word
 * that matches nothing (key, label, or slug) REFUSES the row, naming it.
 * With an empty vocabulary (migration 334 not applied) records pass as-is.
 */
export function resolveImportTypes(
  records: SupplierImportRecord[],
  vocab: readonly { key: string; label: string }[]
): { records: SupplierImportRecord[]; refused: Array<{ row: number; reason: string }> } {
  if (vocab.length === 0) return { records, refused: [] }
  const ok: SupplierImportRecord[] = []
  const refused: Array<{ row: number; reason: string }> = []
  for (const r of records) {
    const keys: string[] = []
    let bad: string | null = null
    for (const t of r.types) {
      const key = resolveVocabularyKey(vocab, t)
      if (!key) { bad = t; break }
      if (!keys.includes(key)) keys.push(key)
    }
    if (bad) {
      refused.push({ row: r.row, reason: `"${r.name}": type "${bad}" is not in your supplier types (Settings → Your vocabulary)` })
      continue
    }
    ok.push({ ...r, types: keys, type: keys[0] })
  }
  return { records: ok, refused }
}

/** Split parsed records against the tenant's existing supplier names
 *  (case-insensitive): existing names are SKIPPED — an import creates,
 *  it never silently updates. */
export function splitAgainstExisting(
  records: SupplierImportRecord[],
  existingNames: Iterable<string>
): { toInsert: SupplierImportRecord[]; skippedExisting: string[] } {
  const existing = new Set(Array.from(existingNames, n => n.trim().toLowerCase()))
  const toInsert: SupplierImportRecord[] = []
  const skippedExisting: string[] = []
  for (const record of records) {
    if (existing.has(record.name.trim().toLowerCase())) {
      skippedExisting.push(record.name)
    } else {
      toInsert.push(record)
    }
  }
  return { toInsert, skippedExisting }
}
