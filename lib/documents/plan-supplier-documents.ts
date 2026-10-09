// ============================================
// Which supplier documents a trip needs, and which it has not got yet
// ============================================
// "Generate documents" (POST /api/itineraries/[id]/generate-documents) and
// the trip's documents page (GET on the same route) both ask this: the
// first creates what is missing, the second lists it. Grouping is
// lib/documents/group-services; this is the rest of what the route did, made
// pure so both answer the same thing.
//
// Why the documents page asks at all (live ITN-S-2026-8987, 2026-10-09): the
// documents are a snapshot of the trip when Generate ran. The trip was then
// saved again in the Pricing Grid — which rewrites every line — and its
// Cairo meals, entrance fees and guides had no document, with nothing on the
// page to say so. Generate makes only what is missing (its key is the
// group's), so the page now offers exactly that.
//
// A night's document checks out the morning AFTER its last night. It used to
// check out on the last night itself: nights on Oct 1, 2 and 3 printed
// "check-out Oct 3, 2 nights".
//
// And it is one STAY: the same property on consecutive nights. Nights were
// grouped by city (or supplier) alone, so Cairo → Nile cruise → Cairo made
// ONE "Cairo Hotel" voucher from the first Cairo night to the morning after
// the last — the hotel booked straight through the cruise — and two Cairo
// hotels shared one voucher. A stay is named after its property when the
// lines name one. A document the trip already has covers a stay when its
// dates overlap it, so vouchers made before this (named "Cairo Hotel") are
// recognised rather than made again.

import type { Database, Json } from '@/types/database.types'
import { transportCrew } from './transport-crew'
import { docMappingFor, serviceCity, PlaceNames, entranceLineName, unassignedDocKey } from './group-services'
import { propertyFromService, propertyKey } from '@/lib/itineraries/overnight-property'

/** Supplier type → the document its services go on. */
export const SUPPLIER_TO_DOC_TYPE: Record<string, string> = {
  hotel: 'hotel_voucher',
  transport: 'transport_voucher',
  driver: 'transport_voucher',
  guide: 'guide_assignment',
  cruise: 'cruise_voucher',
  restaurant: 'service_order',
  activity_provider: 'service_order',
  attraction: 'service_order',
  tour_operator: 'service_order',
  ground_handler: 'service_order',
  dmc: 'service_order',
}

/** The title of a document with no supplier, after its place. */
const DEFAULT_SUPPLIER_NAMES: Record<string, Record<string, string>> = {
  hotel_voucher: { default: 'Hotel' },
  transport_voucher: { default: 'Transportation' },
  guide_assignment: { default: 'Guide Services' },
  cruise_voucher: { default: 'Cruise Line' },
  service_order: {
    meals: 'Restaurant & Meals',
    entrance: 'Entrance Fees',
    assistance: 'Meet & Assist',
    default: 'Ground Services',
  },
}

/* eslint-disable @typescript-eslint/no-explicit-any -- rows as the database returns them */
export interface PlanDay {
  day_number: number
  date: string | null
  city?: string | null
  overnight_city?: string | null
  attractions?: unknown[] | null
  services?: any[] | null
}

export interface PlanInput {
  tenantId: string
  itinerary: any
  days: PlanDay[]
  /** Suppliers named on the trip's services, by id. */
  suppliers: Record<string, any>
  /** The trip's documents that are not cancelled. */
  existing: Array<{
    supplier_id: string | null
    document_type: string
    supplier_name: string | null
    check_in?: string | null
    check_out?: string | null
  }>
  /** Only these types; null = every type. */
  documentTypes: string[] | null
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The day after a YYYY-MM-DD date, as YYYY-MM-DD. */
export function dayAfter(date: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '')
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1))
  return d.toISOString().slice(0, 10)
}

interface Group {
  docType: string
  category?: string
  supplierId: string | null
  supplierName: string
  city: string
  cities: Set<string>
  services: Array<Record<string, unknown>>
  dates: { min: string; max: string }
}

const NIGHTLY = new Set(['hotel_voucher', 'cruise_voucher'])

/** A night group's stays: runs of consecutive nights at one property. A line
 *  that names no property (a supplement, a placeholder) joins the stay its
 *  night falls in, else the nearest one before it. */
function splitStays(key: string, group: Group, named: boolean): Array<[string, Group]> {
  type Night = { line: Record<string, unknown>; date: string; property: string | null; label: string | null }
  const nights: Night[] = group.services.map(line => {
    const p = propertyFromService(line as Parameters<typeof propertyFromService>[0])
    return { line, date: String(line.date ?? ''), property: p ? propertyKey(p.name) : null, label: p?.name ?? null }
  })
  const dated = nights.filter(n => n.date).sort((a, b) => a.date.localeCompare(b.date))
  if (dated.length === 0) return [[key, group]]

  const stays: Array<{ first: string; last: string; property: string | null; label: string | null; lines: Night[] }> = []
  for (const n of dated.filter(n => n.property)) {
    const cur = stays[stays.length - 1]
    if (cur && cur.property === n.property && (n.date === cur.last || n.date === dayAfter(cur.last))) {
      cur.last = n.date
      cur.lines.push(n)
    } else {
      stays.push({ first: n.date, last: n.date, property: n.property, label: n.label, lines: [n] })
    }
  }
  // Nothing names a property: consecutive nights are one stay.
  if (stays.length === 0) {
    for (const n of dated) {
      const cur = stays[stays.length - 1]
      if (cur && (n.date === cur.last || n.date === dayAfter(cur.last))) { cur.last = n.date; cur.lines.push(n) }
      else stays.push({ first: n.date, last: n.date, property: null, label: null, lines: [n] })
    }
  } else {
    for (const n of nights.filter(n => !n.property)) {
      const stay = stays.find(s => n.date && n.date >= s.first && n.date <= s.last)
        ?? [...stays].reverse().find(s => n.date && s.first <= n.date)
        ?? stays[0]
      stay.lines.push(n)
    }
  }
  if (stays.length === 1 && !named) return [[key, group]]

  return stays.map(stay => {
    const lines = nights.filter(n => stay.lines.includes(n)).map(n => n.line)
    return [`${key}|${stay.first}`, {
      ...group,
      // A supplier's voucher keeps the supplier's name; otherwise the property's.
      supplierName: group.supplierId ? group.supplierName : (stay.label || group.supplierName),
      services: lines,
      dates: { min: stay.first, max: stay.last },
    }]
  })
}

type Existing = PlanInput['existing'][number]

/** Does a document the trip has cover this stay? Dates overlapping
 *  [check-in, check-out) — or, for one with no dates, the key its whole
 *  group (before the split into stays) had. */
function covers(doc: Existing, group: Group, baseKey: string): boolean {
  if (doc.document_type !== group.docType || (doc.supplier_id ?? null) !== group.supplierId) return false
  const from = doc.check_in?.slice(0, 10)
  if (!from) return docKey(doc) === baseKey
  const to = doc.check_out?.slice(0, 10) || dayAfter(from)!
  return group.dates.min < to && group.dates.max >= from
}

const docKey = (d: Existing): string => d.supplier_id
  ? `${d.supplier_id}-${d.document_type}`
  : unassignedDocKey(d.document_type, d.supplier_name || '')

export type SupplierDocumentInsert = Database['public']['Tables']['supplier_documents']['Insert']

/** The documents the trip should have and has not: rows ready to insert
 *  (document_number '' — numbered at insert by lib/documents/numberer). */
export function planSupplierDocuments(input: PlanInput): SupplierDocumentInsert[] {
  const { tenantId, itinerary, days, suppliers, existing, documentTypes } = input
  const groups = new Map<string, Group>()
  const places = new PlaceNames()

  for (const day of days) {
    for (const raw of day.services ?? []) {
      // Tips, water, supplies, a flight… go on no document.
      const mapping = docMappingFor(raw)
      if (!mapping?.docType) continue

      const date = day.date ?? ''
      const city = places.name(serviceCity(mapping, day))
      // An entrance line names its sites, even when it was saved as the one
      // generic "Entrance Fees" line of the day.
      const service = mapping.category === 'entrance'
        ? { ...raw, service_name: entranceLineName(raw, day.attractions) }
        : raw

      const supplier = service.supplier_id ? suppliers[service.supplier_id] : null
      let key: string
      let fresh: () => Group
      if (supplier) {
        // A supplier's services go on one document of the supplier's kind.
        const docType = SUPPLIER_TO_DOC_TYPE[supplier.type] || mapping.docType
        key = `${supplier.id}-${docType}`
        fresh = () => ({ docType, category: mapping.category, supplierId: supplier.id, supplierName: supplier.name, city, cities: new Set(), services: [], dates: { min: date, max: date } })
      } else {
        // No supplier: by kind and place. Meals, entrance fees and meet &
        // assist are separate orders (their titles differ).
        const names = DEFAULT_SUPPLIER_NAMES[mapping.docType] || { default: 'Services' }
        const supplierName = `${city} ${names[mapping.category || 'default'] || names.default || 'Services'}`
        key = unassignedDocKey(mapping.docType, supplierName)
        fresh = () => ({ docType: mapping.docType!, category: mapping.category, supplierId: null, supplierName, city, cities: new Set(), services: [], dates: { min: date, max: date } })
      }

      const group = groups.get(key) ?? fresh()
      groups.set(key, group)
      group.services.push({ ...service, day_number: day.day_number, date: day.date, city })
      group.cities.add(city)
      if (date && (!group.dates.min || date < group.dates.min)) group.dates.min = date
      if (date && (!group.dates.max || date > group.dates.max)) group.dates.max = date
    }
  }

  // Nights: one document per stay, named after its property.
  const planned: Array<[string, Group, string]> = []
  for (const [key, group] of groups) {
    if (NIGHTLY.has(group.docType)) planned.push(...splitStays(key, group, !group.supplierId).map(([k, g]) => [k, g, key] as [string, Group, string]))
    else planned.push([key, group, key])
  }

  // What the trip already has, keyed as the groups are.
  const have = new Set(existing.map(docKey))

  const rows: SupplierDocumentInsert[] = []
  for (const [key, group, baseKey] of planned) {
    if (NIGHTLY.has(group.docType)) {
      if (existing.some(d => covers(d, group, baseKey))) continue
    } else if (have.has(key)) continue
    if (documentTypes && !documentTypes.includes(group.docType)) continue

    const supplier = group.supplierId ? suppliers[group.supplierId] : null
    const nightly = NIGHTLY.has(group.docType)
    rows.push({
      tenant_id: tenantId,
      itinerary_id: itinerary.id,
      supplier_id: group.supplierId,
      document_type: group.docType,
      document_number: '',
      supplier_name: group.supplierName,
      supplier_contact_name: supplier?.contact_name ?? null,
      supplier_contact_email: supplier?.contact_email ?? null,
      supplier_contact_phone: supplier?.contact_phone ?? null,
      supplier_address: supplier
        ? [supplier.address, supplier.city, supplier.country].filter(Boolean).join(', ')
        : group.city,
      client_name: itinerary.client_name,
      client_nationality: itinerary.nationality,
      num_adults: itinerary.num_adults || 1,
      num_children: itinerary.num_children || 0,
      services: group.services.map(s => ({
        service_type: s.service_type,
        service_name: s.service_name,
        quantity: s.quantity,
        date: s.date,
        day_number: s.day_number,
        city: s.city,
        notes: s.notes,
        total_cost: s.total_cost,
      })) as Json,
      city: supplier ? Array.from(group.cities).join(', ') : group.city,
      service_date: nightly ? null : (group.dates.min || (supplier ? null : itinerary.start_date) || null),
      check_in: nightly ? group.dates.min || null : null,
      // The morning after the last night.
      check_out: nightly ? dayAfter(group.dates.max) : null,
      currency: itinerary.currency || 'EUR',
      total_cost: group.services.reduce((sum, s) => sum + (parseFloat(String(s.total_cost)) || 0), 0),
      payment_terms: supplier ? (supplier.payment_terms || 'commission') : 'pay_direct',
      status: 'draft',
      // The vehicle and driver the trip's transport lines name (migration 402).
      ...(group.docType === 'transport_voucher' ? transportCrew(group.services as Parameters<typeof transportCrew>[0]) : {}),
    })
  }
  return rows
}
