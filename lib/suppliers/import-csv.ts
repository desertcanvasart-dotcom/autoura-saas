// ============================================
// Suppliers CSV import — pure parsing/classification (B-item 7)
// ============================================
// The suppliers page could export but never import. The format is the export's
// own (headers case-insensitive; unknown columns ignored), so an exported file
// round-trips — a promise that was FALSE until 2026-09-14, because the export
// and this parser each kept their own column list. Both now derive from
// lib/suppliers/csv-schema.ts, and a parity test fails if they part ways.
//
// The natural-key doctrine (A-item 5) applies:
//   - two rows in one file sharing a name, or a code → the later rows are
//     REFUSED with the collision named, never last-row-wins;
//   - a supplier that already exists is UPDATED (planSupplierImport): matched
//     on its code, whatever the case, else on its name. It used to be skipped
//     — "an import creates" — while the page promised "updates existing ones
//     by code", so an edited export re-imported changed nothing. The cells the
//     row fills in are written; a blank cell leaves the stored value alone.
//   - the sample's example row (code EXAMPLE-…) is skipped and counted.
//
// Type is NOT identity: a row without one imports as 'other' and is
// REPORTED, not refused — a real list of 64 suppliers with no Type column
// should land as unclassified rows to reclassify, not bounce 64 times
// (which is exactly what happened on first use).

import Papa from 'papaparse'
import { resolveVocabularyKey } from '@/lib/vocabulary'
import {
  supplierCsvHeaderMap,
  parsePropertiesCell,
  type ParsedPropertyEntry,
} from '@/lib/suppliers/csv-schema'

// A supplier can fill SEVERAL roles (migration 340): the Type cell may list
// them separated by | ; or / — "hotel | transport company" — in the agency's
// keys or labels. resolveImportTypes() turns the words into vocabulary keys
// and REFUSES a row naming a role the agency does not have, so a typo never
// lands as a bogus type (the database would refuse it anyway, as a 500).

// Derived from lib/suppliers/csv-schema.ts — the one place the column set is
// written down. It used to be a second hand-maintained copy here, and the two
// drifted until the export wrote 8 columns the importer read 12 of.
const HEADER_MAP: Record<string, string> = supplierCsvHeaderMap()

export interface SupplierImportRecord {
  /** 1-based CSV line (header is line 1). */
  row: number
  name: string
  /** Portable supplier code (SUP-0001) from the other install, when the sheet carries it. */
  supplier_code?: string
  /** False when the row named no type and 'other' was assumed: an update
   *  then leaves the stored roles alone. */
  typeGiven?: boolean
  /** The PRIMARY role (types[0]). */
  type: string
  /** Every role the Type cell named, as slugs (or vocabulary keys after resolveImportTypes). */
  types: string[]
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  phone2?: string
  whatsapp?: string
  address?: string
  city?: string
  country?: string
  commission_type?: string
  default_commission_rate?: number
  status?: string
  notes?: string
  website?: string
  /** The assets this supplier operates, as the Properties cell named them.
   *  Resolved to supplier_properties rows by the import ROUTE, which is where
   *  the supplier's id and its allowed property types are known. */
  properties?: ParsedPropertyEntry[]
}

export interface SupplierImportParseResult {
  totalRows: number
  records: SupplierImportRecord[]
  refused: Array<{ row: number; reason: string }>
  /** Names imported with type 'other' because the row named no type. */
  typeDefaulted: string[]
  /** Rows skipped because they are the sample's example row (code EXAMPLE-…). */
  exampleRows?: number
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
  const seenCodes = new Set<string>()
  let exampleRows = 0

  parsed.data.forEach((raw, i) => {
    const rowNum = i + 2 // header is row 1
    const record: Record<string, string | number> = {}
    let badCommission: string | null = null
    for (const [header, value] of Object.entries(raw)) {
      const field = HEADER_MAP[header]
      if (!field) continue
      const v = (value ?? '').trim()
      if (v === '') continue
      if (field === 'default_commission_rate') {
        // "10" or "10%". Anything else is refused: "ten" was stored as 0.
        const n = Number(v.replace(/%$/, '').trim())
        if (Number.isFinite(n) && n >= 0) record[field] = n
        else badCommission = v
        continue
      }
      record[field] = v
    }
    if (/^example[-_]/i.test(String(record.supplier_code ?? ''))) {
      exampleRows++
      return
    }
    if (badCommission !== null) {
      refused.push({ row: rowNum, reason: `Commission "${badCommission}" is not a number — write it like 10 or 10%` })
      return
    }
    // WhatsApp is the only reachable number for many suppliers (the Phone cell
    // is blank). It is a column of its own now, but it STILL falls back into
    // contact_phone when Phone is empty — files written against the old
    // behaviour must keep landing a reachable number.
    if (!record.contact_phone && record.whatsapp) {
      record.contact_phone = record.whatsapp
    }
    // The Properties cell is a list, not a scalar: take it off the record so
    // the string cannot reach a `suppliers` column, and hand the route the
    // parsed entries instead.
    const propertyCell = typeof record.properties === 'string' ? record.properties : ''
    delete record.properties
    const properties = parsePropertiesCell(propertyCell)
    const name = String(record.name ?? '').trim()
    if (!name) {
      refused.push({ row: rowNum, reason: 'missing Name' })
      return
    }
    const typeGiven = Boolean(record.type)
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
    const code = String(record.supplier_code ?? '').trim()
    if (code && seenCodes.has(code.toLowerCase())) {
      refused.push({ row: rowNum, reason: `Code "${code}" appears more than once in this file — each supplier has its own` })
      return
    }
    seenNames.add(key)
    if (code) seenCodes.add(code.toLowerCase())
    const types = splitTypes(String(record.type))
    records.push({
      ...(record as Omit<SupplierImportRecord, 'row' | 'name' | 'type' | 'types'>),
      row: rowNum,
      typeGiven,
      name,
      type: types[0],
      types,
      ...(properties.length > 0 ? { properties } : {}),
    })
  })

  return { totalRows: parsed.data.length, records, refused, typeDefaulted, exampleRows }
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
    // A row that named no role is not checked against the list: an update
    // leaves the stored roles alone, a new supplier lands as 'other' (reported).
    if (r.typeGiven === false) { ok.push(r); continue }
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

export interface ExistingSupplier {
  id: string
  name: string | null
  supplier_code: string | null
}

export interface SupplierImportPlan {
  creates: SupplierImportRecord[]
  updates: Array<{ id: string; record: SupplierImportRecord; matchedBy: 'code' | 'name' }>
  refused: Array<{ row: number; reason: string }>
}

/**
 * Which rows create a supplier and which update one. A row matches an
 * existing supplier on its code (whatever the case), else on its name (also
 * case-insensitive). A row whose name belongs to a supplier with a DIFFERENT
 * code is refused — the sheet and the workspace disagree about who that is.
 */
export function planSupplierImport(
  records: SupplierImportRecord[],
  existing: readonly ExistingSupplier[],
): SupplierImportPlan {
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()
  const byCode = new Map<string, ExistingSupplier>()
  const byName = new Map<string, ExistingSupplier>()
  for (const s of existing) {
    if (s.supplier_code) byCode.set(norm(s.supplier_code), s)
    if (s.name) byName.set(norm(s.name), s)
  }
  const plan: SupplierImportPlan = { creates: [], updates: [], refused: [] }
  const claimed = new Set<string>()
  for (const r of records) {
    const code = norm(r.supplier_code)
    const hitCode = code ? byCode.get(code) : undefined
    const hitName = byName.get(norm(r.name))
    let target: ExistingSupplier | undefined
    let matchedBy: 'code' | 'name' = 'code'
    if (hitCode) {
      target = hitCode
    } else if (hitName) {
      if (code && hitName.supplier_code && norm(hitName.supplier_code) !== code) {
        plan.refused.push({
          row: r.row,
          reason: `"${r.name}" is supplier ${hitName.supplier_code} here, but the sheet gives it code "${r.supplier_code}" — use the code it has, or rename one of them`,
        })
        continue
      }
      target = hitName
      matchedBy = 'name'
    }
    if (!target) { plan.creates.push(r); continue }
    if (claimed.has(target.id)) {
      plan.refused.push({ row: r.row, reason: `"${r.name}" matches a supplier another row of this file already updates` })
      continue
    }
    claimed.add(target.id)
    plan.updates.push({ id: target.id, record: r, matchedBy })
  }
  return plan
}
