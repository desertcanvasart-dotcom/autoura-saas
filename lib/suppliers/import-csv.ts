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

import Papa from 'papaparse'

const HEADER_MAP: Record<string, string> = {
  name: 'name',
  type: 'type',
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
  type: string
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
      parseError: `CSV parsing failed: ${parsed.errors[0].message}`,
    }
  }
  if (parsed.data.length === 0) {
    return { totalRows: 0, records: [], refused: [], parseError: 'No data rows' }
  }

  const refused: Array<{ row: number; reason: string }> = []
  const records: SupplierImportRecord[] = []
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
      refused.push({ row: rowNum, reason: `"${name}" has no Type` })
      return
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
    records.push({
      ...(record as Omit<SupplierImportRecord, 'row' | 'name' | 'type'>),
      row: rowNum,
      name,
      type: String(record.type).trim().toLowerCase().replace(/[\s-]+/g, '_'),
    })
  })

  return { totalRows: parsed.data.length, records, refused }
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
