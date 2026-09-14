// ============================================
// Turning a properties sheet into writes — decided once, in one pure function
// ============================================
// The import ROUTE should do IO and nothing else. Every judgement a row needs —
// which supplier it belongs to, whether that supplier may own that kind of
// asset, whether it updates an existing property or creates one, whether the
// agency recognises the accommodation word — is made here, where it can be
// tested without a database.
//
// The doctrine this follows, from docs/ARCHITECTURE.md: never fabricate, and
// never silently do the wrong thing. Every row this cannot place with certainty
// is REFUSED with the reason named — it is never guessed at, and never dropped
// without a word.

import { propertyTypesForRoles, type PropertyType } from '@/lib/supplier-properties'
import { resolveVocabularyKey } from '@/lib/vocabulary'
import {
  PROPERTY_WRITABLE_FIELDS,
  asPropertyType,
  parseBooleanCell,
} from '@/lib/suppliers/property-csv-schema'

export interface PropertyCsvRow {
  /** 1-based CSV line (header is line 1). */
  row: number
  [field: string]: string | number | undefined
}

export interface SupplierRef {
  id: string
  name: string
  supplier_code: string | null
  /** Every role the supplier fills, as vocabulary KEYS. */
  types: string[]
}

export interface ExistingProperty {
  id: string
  supplier_id: string
  property_type: string
  name: string
}

export interface PropertyPlan {
  creates: Array<Record<string, unknown>>
  updates: Array<{ id: string; patch: Record<string, unknown> }>
  refused: Array<{ row: number; reason: string }>
}

const naturalKey = (supplierId: string, type: string, name: string) =>
  `${supplierId}::${type}::${name.trim().toLowerCase()}`

export function planPropertyCsv(opts: {
  rows: PropertyCsvRow[]
  tenantId: string
  suppliers: SupplierRef[]
  existing: ExistingProperty[]
  /** Vocabulary key → behaviour, so a tenant's own supplier type still resolves. */
  behaviorOf: (typeKey: string) => string
  accommodationVocab: readonly { key: string; label: string }[]
}): PropertyPlan {
  const { rows, tenantId, suppliers, existing, behaviorOf, accommodationVocab } = opts

  const byCode = new Map<string, SupplierRef>()
  const byName = new Map<string, SupplierRef>()
  for (const s of suppliers) {
    if (s.supplier_code) byCode.set(s.supplier_code.trim().toLowerCase(), s)
    byName.set(s.name.trim().toLowerCase(), s)
  }
  const existingById = new Map(existing.map(p => [p.id, p]))
  const existingByKey = new Map(
    existing.map(p => [naturalKey(p.supplier_id, p.property_type, p.name), p])
  )

  const plan: PropertyPlan = { creates: [], updates: [], refused: [] }
  // Two rows in one file aimed at the same property would have the second
  // silently overwrite the first — the collision is named instead.
  const touched = new Map<string, number>()

  for (const raw of rows) {
    const cell = (field: string) => String(raw[field] ?? '').trim()
    const refuse = (reason: string) => plan.refused.push({ row: raw.row, reason })

    // ---- 1. Which supplier? ----
    const code = cell('supplier_code')
    const supplierName = cell('supplier_name')
    const supplier = (code ? byCode.get(code.toLowerCase()) : undefined)
      ?? (supplierName ? byName.get(supplierName.toLowerCase()) : undefined)
    if (!supplier) {
      refuse(
        code || supplierName
          ? `no supplier here matches ${code ? `code "${code}"` : `"${supplierName}"`} — properties belong to a supplier, so add it first`
          : 'no Supplier Code or Supplier name — the row has nothing to attach the property to'
      )
      continue
    }

    // ---- 2. What kind, and may this supplier own one? ----
    const kindCell = cell('property_type')
    const allowed = propertyTypesForRoles(supplier.types.map(behaviorOf))
    let type: PropertyType | null = asPropertyType(kindCell)
    if (kindCell && !type) {
      refuse(`"${kindCell}" is not a kind of property — use ${allowed.length ? allowed.join(', ') : 'ship, hotel or train'}`)
      continue
    }
    if (!type) {
      // Blank Kind is only unambiguous when the supplier's roles allow one.
      if (allowed.length === 1) type = allowed[0]
      else {
        refuse(allowed.length === 0
          ? `"${supplier.name}" fills no role that owns properties, so this row has nowhere to go`
          : `Kind is blank and "${supplier.name}" could own ${allowed.join(' or ')} — say which`)
        continue
      }
    }
    if (!allowed.includes(type)) {
      refuse(`"${supplier.name}" is a ${supplier.types.join('/')} — it does not own a ${type}`)
      continue
    }

    // ---- 3. Identity: the id wins, so a RENAME is possible ----
    const id = cell('id')
    let target: ExistingProperty | undefined
    if (id) {
      target = existingById.get(id)
      if (!target) {
        refuse(`Property ID "${id}" is not a property in this workspace — clear the cell to create a new one`)
        continue
      }
      if (target.supplier_id !== supplier.id) {
        // Moving a property between suppliers is not an edit, it is a different
        // asset; doing it silently would rewrite history on both sides.
        refuse(`Property ID "${id}" belongs to a different supplier — remove the id to create it under "${supplier.name}"`)
        continue
      }
    }

    const name = cell('name')
    if (!name && !target) {
      refuse('missing Name — a property is identified by its name')
      continue
    }
    if (!target && name) target = existingByKey.get(naturalKey(supplier.id, type, name))

    const dedupeKey = target ? `id:${target.id}` : naturalKey(supplier.id, type, name)
    const seenAt = touched.get(dedupeKey)
    if (seenAt !== undefined) {
      refuse(`this property is already set by row ${seenAt} — the later row would silently overwrite it`)
      continue
    }
    touched.set(dedupeKey, raw.row)

    // ---- 4. The values ----
    const patch: Record<string, unknown> = {}
    let rowFailed = false
    for (const field of PROPERTY_WRITABLE_FIELDS) {
      if (field === 'property_type') { patch.property_type = type; continue }
      if (field === 'name') { if (name) patch.name = name; continue }

      if (field === 'is_active') {
        const value = cell('is_active')
        if (value === '') continue
        const parsed = parseBooleanCell(value)
        if (parsed === null) {
          // Treating an unrecognised word as false would retire a property
          // because somebody typed "maybe".
          refuse(`Active says "${value}" — write true or false`)
          rowFailed = true
          break
        }
        patch.is_active = parsed
        continue
      }

      if (field === 'accommodation_type') {
        const value = cell('accommodation_type')
        if (value === '') continue
        if (type !== 'hotel') {
          refuse(`Accommodation Type is for hotels; "${name}" is a ${type}`)
          rowFailed = true
          break
        }
        if (accommodationVocab.length === 0) { patch.accommodation_type = value; continue }
        const key = resolveVocabularyKey(accommodationVocab, value)
        if (!key) {
          refuse(`"${value}" is not in your accommodation types (Settings → Your vocabulary)`)
          rowFailed = true
          break
        }
        patch.accommodation_type = key
        continue
      }

      // Plain text. An EMPTY cell clears the field — this is an edit sheet, and
      // deleting a phone number by emptying its cell is what a person means.
      const value = cell(field)
      patch[field] = value === '' ? null : value
    }
    if (rowFailed) continue

    if (target) plan.updates.push({ id: target.id, patch })
    else plan.creates.push({ tenant_id: tenantId, supplier_id: supplier.id, ...patch })
  }

  return plan
}

// ============================================
// The Properties CELL on the suppliers sheet
// ============================================
// The other shape: "hotel:Nile Star | ship:MS Hapi" against a supplier ROW.
// It shares every rule above — which kinds a supplier's roles allow, refusing
// to guess between two of them, naming a prefix that is not a kind — because
// having two validators for one concept is how the CSV drifted in the first
// place.
//
// It TOPS UP. A property the supplier already has is left exactly as it is; one
// it lacks is created, whether the supplier was created by this import or was
// already on file (the user's decision, 2026-09-14). That is not a silent
// update to the supplier: nothing existing is altered, and the alternative —
// skipping — meant a re-import could never add a ship anybody had added since.

export interface NamedPropertyEntry {
  row: number
  /** The supplier ROW's name, which is how it is matched. */
  supplierName: string
  /** Resolved kind, or null when the cell gave no usable prefix. */
  type: PropertyType | null
  /** What the cell said before the colon, for an honest message. */
  rawType: string | null
  name: string
}

export function planNamedProperties(opts: {
  tenantId: string
  entries: NamedPropertyEntry[]
  suppliers: SupplierRef[]
  existing: ExistingProperty[]
  behaviorOf: (typeKey: string) => string
}): { creates: Array<Record<string, unknown>>; warnings: Array<{ row: number; reason: string }> } {
  const { tenantId, entries, suppliers, existing, behaviorOf } = opts
  const byName = new Map(suppliers.map(s => [s.name.trim().toLowerCase(), s]))
  // Case-insensitively, because the DB's unique key is case-SENSITIVE: without
  // this, "MS Hapi" and "MS HAPI" would become two ships.
  const have = new Set(existing.map(p => naturalKey(p.supplier_id, p.property_type, p.name)))

  const creates: Array<Record<string, unknown>> = []
  const warnings: Array<{ row: number; reason: string }> = []

  for (const entry of entries) {
    const supplier = byName.get(entry.supplierName.trim().toLowerCase())
    if (!supplier) continue // its row did not land; nothing to hang it from

    if (entry.rawType && !entry.type) {
      warnings.push({
        row: entry.row,
        reason: `"${supplier.name}": "${entry.rawType}" is not a kind of property — use ship, hotel or train`,
      })
      continue
    }

    const allowed = propertyTypesForRoles(supplier.types.map(behaviorOf))
    let type = entry.type
    if (!type) {
      if (allowed.length === 1) type = allowed[0]
      else {
        warnings.push({
          row: entry.row,
          reason: allowed.length === 0
            ? `"${supplier.name}": its roles own no properties, so "${entry.name}" has nowhere to go`
            : `"${supplier.name}": say which kind "${entry.name}" is (${allowed.join(' or ')}:${entry.name}) — its roles allow more than one`,
        })
        continue
      }
    }
    if (!allowed.includes(type)) {
      warnings.push({
        row: entry.row,
        reason: `"${supplier.name}": a ${supplier.types.join('/')} does not own a ${type} ("${entry.name}")`,
      })
      continue
    }

    const key = naturalKey(supplier.id, type, entry.name)
    if (have.has(key)) continue // already theirs — a top-up never rewrites
    have.add(key)               // and never inserts the same thing twice
    creates.push({ tenant_id: tenantId, supplier_id: supplier.id, property_type: type, name: entry.name })
  }

  return { creates, warnings }
}
