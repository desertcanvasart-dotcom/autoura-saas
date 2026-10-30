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
// lines name one.
//
// What the trip already has is matched LINE BY LINE (day, type, name): a
// service already on a document is never put on another, so Generate after
// an edit makes documents for the new lines only, and a document whose lines
// are no longer on the trip is out of date (staleSupplierDocuments) — it was
// silently left as it was. A document with no such lines (made by hand) is
// matched as before: by its kind and title, or for a night, by its dates.
//
// Sync (live ITN-S-2026-8987 again): Generate only ever ADDED documents, so a
// draft it had made kept its old lines when the trip changed, and a document
// the trip no longer needed stayed as it was. A draft Generate made and nobody
// has touched since — still a draft, its lines and dates still hashing to
// what Generate wrote (sync_key / synced_hash, migration 438) — is now
// Generate's to keep in step: updated to the trip's lines, or retired (kept
// as Cancelled) when the trip no longer needs it. A document a person edited
// or sent, or one made before Sync, is never changed: it holds its lines and
// is listed as out of date, as before.
//
// Guides: one assignment per GUIDE assigned to the trip (itinerary_resources,
// type guide), under the guide's name, with their languages. Guiding nobody
// is assigned to yet is grouped by the city it happens in: the Cairo guide
// and the Alexandria guide of ITN-S-2026-8987 shared one "Cairo Guide
// Services" assignment.

import { notesWithFacts, answerParts, type ServiceLineFacts } from '@/lib/documents/service-line-facts'
import type { Database, Json } from '@/types/database.types'
import { transportCrew } from './transport-crew'
import { docMappingFor, noDocumentReason, serviceCity, PlaceNames, entranceLineName, unassignedDocKey, type ServiceMapping } from './group-services'
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
    activities: 'Activities & Experiences',
    other: 'Other Services',
    default: 'Ground Services',
  },
}

/* eslint-disable @typescript-eslint/no-explicit-any -- rows as the database returns them */
export interface PlanDay {
  id?: string
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
    id?: string
    document_number?: string | null
    supplier_id: string | null
    document_type: string
    supplier_name: string | null
    check_in?: string | null
    check_out?: string | null
    services?: unknown
    status?: string | null
    sync_key?: string | null
    synced_hash?: string | null
    service_date?: string | null
  }>
  /** The guides assigned to the trip (itinerary_resources, type guide). */
  guides?: PlanGuide[]
  /** Only these types; null = every type. */
  documentTypes: string[] | null
  /** The booking's service line for each itinerary service, by its id (lib/documents/service-line-facts). */
  serviceLines?: Record<string, ServiceLineFacts>
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface PlanGuide {
  resource_id: string
  name: string
  languages?: string[] | null
  email?: string | null
  phone?: string | null
  /** A one-day assignment; otherwise start_date..end_date. */
  itinerary_day_id?: string | null
  start_date?: string | null
  end_date?: string | null
  status?: string | null
}

/** The guide assigned on a day, if any. */
function guideOn(guides: PlanGuide[], day: PlanDay): PlanGuide | null {
  const date = (day.date ?? '').slice(0, 10)
  return guides.find(g => {
    if (String(g.status ?? '').toLowerCase() === 'cancelled') return false
    if (g.itinerary_day_id) return !!day.id && g.itinerary_day_id === day.id
    const from = (g.start_date ?? '').slice(0, 10)
    const to = (g.end_date ?? '').slice(0, 10) || from
    return !!date && !!from && date >= from && date <= to
  }) ?? null
}

const norm = (v: unknown): string => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/** A service line as documents hold it: its day, type and name. */
export function lineKey(s: { day_number?: unknown; service_type?: unknown; service_name?: unknown }): string {
  return `${s.day_number ?? ''}|${norm(s.service_type)}|${norm(s.service_name)}`
}

/** The keyed lines a document holds — none for one made by hand. */
function docLines(doc: { services?: unknown }): string[] {
  if (!Array.isArray(doc.services)) return []
  return doc.services
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object' && (l as Record<string, unknown>).day_number != null && !!(l as Record<string, unknown>).service_name)
    .map(lineKey)
}

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
  guide?: PlanGuide
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
/** Every line of the trip that goes on a document, as documents key it. */
function tripLines(days: PlanDay[]): Array<{ day: PlanDay; service: any; mapping: ServiceMapping & { docType: string }; key: string }> { // eslint-disable-line @typescript-eslint/no-explicit-any -- service rows
  const out = []
  for (const day of days) {
    for (const raw of day.services ?? []) {
      // Tips, water, supplies, a flight… go on no document.
      const mapping = docMappingFor(raw)
      if (!mapping.docType) continue
      // An entrance line names its sites, even when it was saved as the one
      // generic "Entrance Fees" line of the day.
      const service = mapping.category === 'entrance'
        ? { ...raw, service_name: entranceLineName(raw, day.attractions) }
        : raw
      out.push({ day, service, mapping: mapping as ServiceMapping & { docType: string }, key: lineKey({ ...service, day_number: day.day_number }) })
    }
  }
  return out
}

/**
 * The trip's documents that no longer match it: lines on them that the trip
 * does not have any more (removed, renamed, or moved to another day). A
 * document made by hand (no keyed lines) is never reported.
 */
export function staleSupplierDocuments(days: PlanDay[], existing: PlanInput['existing']): Array<{ id: string; document_number: string | null; supplier_name: string | null; gone: number }> {
  const current = new Set(tripLines(days).map(l => l.key))
  return existing.flatMap(doc => {
    const gone = docLines(doc).filter(k => !current.has(k)).length
    return doc.id && gone > 0 ? [{ id: doc.id, document_number: doc.document_number ?? null, supplier_name: doc.supplier_name, gone }] : []
  })
}

/**
 * A transport voucher with ONE service line: its pickup time and place go in
 * the voucher's own fields (several lines keep theirs on each line), and the
 * driver of the day fills the driver field when the trip named none.
 */
function transportFields(
  services: Parameters<typeof transportCrew>[0],
  facts: Array<ServiceLineFacts | undefined>,
): Record<string, string | null> {
  const crew = transportCrew(services)
  const known = facts.filter((f): f is ServiceLineFacts => !!f)
  const out: Record<string, string | null> = { ...crew }
  if (facts.length === 1 && known.length === 1) {
    const f = known[0]
    if (f.service_time?.trim()) out.pickup_time = f.service_time.trim().slice(0, 5)
    if (f.pickup_location?.trim()) out.pickup_location = f.pickup_location.trim()
    if (f.dropoff_location?.trim()) out.dropoff_location = f.dropoff_location.trim()
  }
  const drivers = [...new Set(known.filter(f => answerParts(f).length > 0).map(f => f.driver_note?.trim()).filter((d): d is string => !!d))]
  if (!crew.driver_name && drivers.length) out.driver_name = drivers.join(', ').slice(0, 255)
  return out
}

export function planSupplierDocuments(input: PlanInput): SupplierDocumentInsert[] {
  const { tenantId, itinerary, days, suppliers, documentTypes } = input
  const guides = input.guides ?? []
  const lineFacts = input.serviceLines ?? {}
  const factsOf = (s: Record<string, unknown>) => (typeof s.id === 'string' ? lineFacts[s.id] : undefined)
  const groups = new Map<string, Group>()
  const places = new PlaceNames()

  // A line already on one of the trip's documents goes on no other.
  const onDocs = new Set(input.existing.flatMap(docLines))
  // Documents made by hand hold no keyed lines: matched by title or dates.
  const existing = input.existing.filter(d => docLines(d).length === 0)

  for (const { day, service, mapping, key: lk } of tripLines(days)) {
    {
      // Named before the skip: which spelling names a place (Cairo, not Giza)
      // is the trip's first, whether or not that line is already on a document.
      const city = places.name(serviceCity(mapping, day))
      if (onDocs.has(lk)) continue
      const date = day.date ?? ''
      const supplier = service.supplier_id ? suppliers[service.supplier_id] : null
      const guide = !supplier && mapping.docType === 'guide_assignment' ? guideOn(guides, day) : null
      let key: string
      let fresh: () => Group
      if (guide) {
        // The guide assigned that day: one assignment per guide.
        key = `guide:${guide.resource_id}`
        fresh = () => ({ docType: 'guide_assignment', supplierId: null, guide, supplierName: guide.name, city, cities: new Set(), services: [], dates: { min: date, max: date } })
      } else if (supplier) {
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
        fresh = () => ({ docType: mapping.docType, category: mapping.category, supplierId: null, supplierName, city, cities: new Set(), services: [], dates: { min: date, max: date } })
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

  // What the trip already has by hand, keyed as the groups are.
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
      supplier_contact_name: supplier?.contact_name ?? group.guide?.name ?? null,
      supplier_contact_email: supplier?.contact_email ?? group.guide?.email ?? null,
      // The WhatsApp number first, as for guides: a hotel with only WhatsApp
      // filled in got a voucher it could not be sent.
      supplier_contact_phone: supplier?.whatsapp || supplier?.contact_phone || group.guide?.phone || null,
      supplier_address: supplier
        ? [supplier.address, supplier.city, supplier.country].filter(Boolean).join(', ')
        : Array.from(group.cities).join(', '),
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
        notes: notesWithFacts(s.notes as string | null | undefined, factsOf(s)),
        total_cost: s.total_cost,
      })) as Json,
      city: supplier || group.guide ? Array.from(group.cities).join(', ') : group.city,
      // What the guide needs beyond the lines: the languages to guide in.
      ...(group.guide?.languages?.length ? { special_requests: `Languages: ${group.guide.languages.join(', ')}` } : {}),
      service_date: nightly ? null : (group.dates.min || (supplier ? null : itinerary.start_date) || null),
      check_in: nightly ? group.dates.min || null : null,
      // The morning after the last night.
      check_out: nightly ? dayAfter(group.dates.max) : null,
      currency: itinerary.currency || 'EUR',
      total_cost: group.services.reduce((sum, s) => sum + (parseFloat(String(s.total_cost)) || 0), 0),
      payment_terms: supplier ? (supplier.payment_terms || 'commission') : 'pay_direct',
      status: 'draft',
      sync_key: key,
      // The vehicle and driver the trip's transport lines name (migration 402).
      ...(group.docType === 'transport_voucher' ? transportFields(group.services, group.services.map(factsOf)) : {}),
    })
  }
  for (const row of rows) row.synced_hash = documentHash(row)
  return rows
}

// ── Sync ────────────────────────────────────────────────────────────────────

/** JSON with keys sorted and empty values dropped: jsonb reorders keys and
 *  drops nothing, the planner leaves some keys undefined — both must hash
 *  the same. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== null && x !== undefined && x !== '')
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`
  }
  if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) return String(Number(v))
  return JSON.stringify(v ?? null)
}

/** cyrb53 — enough to notice a hand edit; not security. */
function hash53(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** What Generate wrote that a person might change by hand: the lines and
 *  the dates. Contact details, notes and requests are not in it — a person
 *  filling those in keeps the draft Generate's, and Sync leaves them be. */
export function documentHash(doc: { services?: unknown; check_in?: string | null; check_out?: string | null; service_date?: string | null }): string {
  const day = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : null)
  return hash53(canonical({ services: doc.services ?? [], check_in: day(doc.check_in), check_out: day(doc.check_out), service_date: day(doc.service_date) }))
}

/** A draft Generate made that nobody has touched since: Sync's to change. */
export function isUntouchedDraft(doc: PlanInput['existing'][number]): boolean {
  return doc.status === 'draft' && !!doc.sync_key && !!doc.synced_hash && documentHash(doc) === doc.synced_hash
}

/** The fields Sync rewrites on a draft it keeps: what the trip decides.
 *  Contacts, notes and requests stay as a person left them. */
const SYNCED_FIELDS = [
  'services', 'total_cost', 'check_in', 'check_out', 'service_date', 'city', 'supplier_name',
  'client_name', 'client_nationality', 'num_adults', 'num_children', 'currency',
  'vehicle_type', 'driver_name', 'synced_hash',
] as const

export interface SyncPlan {
  /** New documents, ready to insert. */
  create: SupplierDocumentInsert[]
  /** Untouched drafts brought in step with the trip. */
  update: Array<{ id: string; document_number: string | null; supplier_name: string | null; fields: Partial<SupplierDocumentInsert> }>
  /** Untouched drafts the trip no longer needs: kept, as Cancelled. */
  retire: Array<{ id: string; document_number: string | null; supplier_name: string | null }>
  /** Documents a person edited or sent (or made before Sync) that hold
   *  lines the trip no longer has: never changed, listed. */
  stale: ReturnType<typeof staleSupplierDocuments>
}

export function syncSupplierDocuments(input: PlanInput): SyncPlan {
  const ours = input.existing.filter(isUntouchedDraft)
  const kept = input.existing.filter(d => !isUntouchedDraft(d))
  // Generate's own drafts hold no lines: planned afresh as if they were not
  // there, then matched back to the draft that already has the key.
  const planned = planSupplierDocuments({ ...input, existing: kept })
  const create: SyncPlan['create'] = []
  const update: SyncPlan['update'] = []
  const matched = new Set<string>()
  for (const row of planned) {
    const draft = ours.find(d => d.id && !matched.has(d.id) && d.sync_key === row.sync_key && d.document_type === row.document_type)
    if (!draft?.id) { create.push(row); continue }
    matched.add(draft.id)
    if (draft.synced_hash === row.synced_hash) continue
    const fields: Partial<SupplierDocumentInsert> = {}
    for (const f of SYNCED_FIELDS) if (f in row) (fields as Record<string, unknown>)[f] = (row as Record<string, unknown>)[f]
    update.push({ id: draft.id, document_number: draft.document_number ?? null, supplier_name: draft.supplier_name, fields })
  }
  const retire = ours
    .filter(d => d.id && !matched.has(d.id) && (!input.documentTypes || input.documentTypes.includes(d.document_type)))
    .map(d => ({ id: d.id!, document_number: d.document_number ?? null, supplier_name: d.supplier_name }))
  return { create, update, retire, stale: staleSupplierDocuments(input.days, kept) }
}

// ── Coverage: what the documents would otherwise hide ──────────────────────

export interface CoverageWarning {
  kind: 'night_without_hotel' | 'trip_without_transport' | 'day_without_transport'
  dayNumber?: number
  message: string
}

const ON_BOARD_NIGHT = /^on board\b/i
const clean = (v: unknown): string => String(v ?? '').trim()

/**
 * Nights and days that look unplanned — a trip problem, not a document one,
 * but one the documents hide: no line means no voucher, and nothing said so.
 *   - a night with no hotel or cruise line, when other nights have one (a
 *     trip that books no beds at all is a day-tour programme, not a gap);
 *   - a day with sightseeing (a guide, entrance fees, activities) and no
 *     transport line. A day on a cruise, or the morning after a night on
 *     board, is exempt: the cruise's excursions carry it.
 * The last day has no night.
 */
export function coverageWarnings(days: readonly PlanDay[]): CoverageWarning[] {
  const sorted = [...days].sort((a, b) => a.day_number - b.day_number)
  const goesOn = (d: PlanDay, test: (m: ServiceMapping) => boolean) => (d.services ?? []).some(s => {
    const m = docMappingFor(s)
    return !!m.docType && test(m)
  })
  const hasNight = (d: PlanDay) => goesOn(d, m => m.docType === 'hotel_voucher' || m.docType === 'cruise_voucher')
  const hasCruise = (d: PlanDay) => goesOn(d, m => m.docType === 'cruise_voucher')
  const hasTransport = (d: PlanDay) => goesOn(d, m => m.docType === 'transport_voucher')
  const sightseeing = (d: PlanDay) => goesOn(d, m => m.docType === 'guide_assignment' || m.category === 'entrance' || m.category === 'activities')
  const warnings: CoverageWarning[] = []

  const nights = sorted.slice(0, -1)
  if (nights.some(hasNight)) {
    for (const d of nights) {
      if (hasNight(d)) continue
      const where = clean(d.overnight_city) || clean(d.city)
      warnings.push({ kind: 'night_without_hotel', dayNumber: d.day_number, message: `Night ${d.day_number}${where ? ` (${where})` : ''} has no hotel or cruise line, so no voucher books it.` })
    }
  }

  if (!sorted.some(hasTransport)) {
    if (sorted.some(sightseeing)) warnings.push({ kind: 'trip_without_transport', message: 'This trip has sightseeing but no transport line, so there is no transport voucher.' })
  } else {
    const onCruise = (d: PlanDay, i: number) =>
      hasCruise(d) || ON_BOARD_NIGHT.test(clean(d.overnight_city)) || (i > 0 && (hasCruise(sorted[i - 1]) || ON_BOARD_NIGHT.test(clean(sorted[i - 1].overnight_city))))
    for (const [i, d] of sorted.entries()) {
      if (sightseeing(d) && !hasTransport(d) && !onCruise(d, i)) {
        warnings.push({ kind: 'day_without_transport', dayNumber: d.day_number, message: `Day ${d.day_number}${clean(d.city) ? ` (${clean(d.city)})` : ''} has sightseeing but no transport line.` })
      }
    }
  }
  return warnings
}

/** The trip's lines that go on no document, on purpose, and why. */
export function excludedLines(days: readonly PlanDay[]): Array<{ day_number: number; service_name: string; reason: string }> {
  return days.flatMap(d => (d.services ?? []).flatMap(s => {
    const reason = noDocumentReason(s)
    return reason ? [{ day_number: d.day_number, service_name: clean(s.service_name) || clean(s.service_type), reason }] : []
  }))
}
