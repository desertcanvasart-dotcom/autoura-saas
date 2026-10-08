// ============================================
// Supplier documents that always match the itinerary
// ============================================
// Live ITN-S-2026-8987: after "Generate", the newest documents were a guide
// assignment, a meals order and an entrance order — each missing services —
// and no hotel or transport voucher among them. Nothing was wrong with the
// trip; the documents were. Four causes, each fixed here:
//
//   1. A document that already existed was skipped on every later Generate,
//      so a trip edited after its first Generate never reached its documents,
//      and a change of grouping left half-old, half-new sets behind.
//      → Sync: drafts the app made are UPDATED; what it no longer needs is
//        retired; documents a person edited or sent are never overwritten —
//        they are reported, with the action (lib/documents/sync-plan →
//        reconcileDocuments).
//   2. One document per kind PER CITY: a Giza/Cairo/Alexandria trip's meals
//      and sites were spread over several orders, each "incomplete".
//      → One per kind for the whole trip, each line with its date and city;
//        one hotel voucher per STAY (property and consecutive nights).
//   3. Service types it did not know were dropped without a word — airport
//      meet & assist, hotel porterage, and every Pricing Grid experience,
//      boat ride and extra (the grid saves those as 'other', which was "no
//      document on purpose").
//      → Every line lands on a document unless it is excluded ON PURPOSE
//        (tips, water, flights); anything unknown goes on "Other services".
//   4. Nothing said so. → coverageOf(): every line, the document it is on,
//      the ones excluded and why, and nights or days that look unplanned.
//
// Pure: the route, the coverage panel and the tests share it.

import { createHash } from 'crypto'
import { entranceLineName } from './group-services'
import { propertyFromService, overnightProperty } from '@/lib/itineraries/overnight-property'

// ── What a line goes on ─────────────────────────────────────────────────────

export type DocType = 'hotel_voucher' | 'cruise_voucher' | 'transport_voucher' | 'guide_assignment' | 'service_order'
export type OrderKind = 'meals' | 'entrance' | 'activities' | 'assistance' | 'other'

export type LineDestination =
  | { docType: DocType; kind?: OrderKind }
  | { excluded: string }

const EXCLUDED: Record<string, string> = {
  tip: 'Tips are paid on the day',
  tips: 'Tips are paid on the day',
  water: 'Water and supplies are bought by the team',
  supplies: 'Water and supplies are bought by the team',
  flight: 'Flights are ticketed by the airline',
  service_fee: 'An agency fee, not a supplier service',
}

const BY_TYPE: Record<string, { docType: DocType; kind?: OrderKind }> = {
  transportation: { docType: 'transport_voucher' },
  transport: { docType: 'transport_voucher' },
  transfer: { docType: 'transport_voucher' },
  guide: { docType: 'guide_assignment' },
  meal: { docType: 'service_order', kind: 'meals' },
  lunch: { docType: 'service_order', kind: 'meals' },
  dinner: { docType: 'service_order', kind: 'meals' },
  breakfast: { docType: 'service_order', kind: 'meals' },
  entrance: { docType: 'service_order', kind: 'entrance' },
  entrance_fee: { docType: 'service_order', kind: 'entrance' },
  activity: { docType: 'service_order', kind: 'activities' },
  tour: { docType: 'service_order', kind: 'activities' },
  excursion: { docType: 'service_order', kind: 'activities' },
  airport_service: { docType: 'service_order', kind: 'assistance' },
  airport_services: { docType: 'service_order', kind: 'assistance' },
  hotel_service: { docType: 'service_order', kind: 'assistance' },
  hotel_services: { docType: 'service_order', kind: 'assistance' },
  accommodation: { docType: 'hotel_voucher' },
  hotel: { docType: 'hotel_voucher' },
  cruise: { docType: 'cruise_voucher' },
  extra: { docType: 'service_order', kind: 'other' },
  other: { docType: 'service_order', kind: 'other' },
}

/** The Pricing Grid's slot, from the "[pricing-grid:<slot>] …" tag on its lines. */
const GRID_SLOT = /^\[pricing-grid:([a-z_]+)\]/

// The grid saves several slots under one generic type ('other', 'transfer'):
// its slot says what the line really is.
const BY_GRID_SLOT: Record<string, LineDestination> = {
  cruise: { docType: 'cruise_voucher' },
  experiences: { docType: 'service_order', kind: 'activities' },
  boat_rides: { docType: 'service_order', kind: 'activities' },
  airport_services: { docType: 'service_order', kind: 'assistance' },
  hotel_services: { docType: 'service_order', kind: 'assistance' },
  water: { excluded: EXCLUDED.water },
  tipping: { excluded: EXCLUDED.tip },
  flights: { excluded: EXCLUDED.flight },
}

/** Every service type the app writes resolves here (a test holds the writers to it). */
export const KNOWN_SERVICE_TYPES = [...Object.keys(EXCLUDED), ...Object.keys(BY_TYPE)]

export function destinationOf(line: { service_type?: string | null; description?: string | null }): LineDestination {
  const slot = String(line.description ?? '').match(GRID_SLOT)?.[1]
  if (slot && BY_GRID_SLOT[slot]) return BY_GRID_SLOT[slot]
  const type = String(line.service_type ?? '').trim().toLowerCase()
  if (EXCLUDED[type]) return { excluded: EXCLUDED[type] }
  // Unknown is never "nowhere": it goes on Other services, where it is seen.
  return BY_TYPE[type] ?? { docType: 'service_order', kind: 'other' }
}

export const ORDER_TITLES: Record<OrderKind, string> = {
  meals: 'Restaurant & Meals',
  entrance: 'Entrance Fees',
  activities: 'Activities & Experiences',
  assistance: 'Airport & Hotel Assistance',
  other: 'Other Services',
}

const DOC_TITLES: Record<Exclude<DocType, 'service_order'>, string> = {
  hotel_voucher: 'Hotel',
  cruise_voucher: 'Cruise',
  transport_voucher: 'Transportation',
  guide_assignment: 'Guide Services',
}

// ── The plan ────────────────────────────────────────────────────────────────

export interface PlanService {
  id: string
  service_type?: string | null
  service_name?: string | null
  description?: string | null
  supplier_id?: string | null
  supplier_name?: string | null
  quantity?: number | null
  notes?: string | null
  total_cost?: number | string | null
}

export interface PlanDay {
  day_number: number
  date?: string | null
  city?: string | null
  overnight_city?: string | null
  attractions?: string[] | null
  services?: PlanService[] | null
}

export interface PlanSupplier {
  id: string
  name?: string | null
  contact_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  payment_terms?: string | null
}

/** One line as it is written on a document. */
export interface DocLine {
  service_id: string
  service_type: string | null
  service_name: string
  quantity: number | null
  date: string | null
  day_number: number
  city: string
  notes: string | null
  total_cost: number | null
}

export interface PlannedDoc {
  /** Stable identity: the same document across syncs. */
  key: string
  docType: DocType
  kind?: OrderKind
  title: string
  supplierId: string | null
  lines: DocLine[]
  cities: string[]
  firstDate: string | null
  lastDate: string | null
  /** Hotel and cruise: the night after the last one. */
  checkOut: string | null
  totalCost: number
}

export interface ExcludedLine { line: DocLine; reason: string }

const clean = (v: unknown) => String(v ?? '').trim()
const ON_BOARD = /^on board\b/i

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Where a line happens: nights where the bed is; everything else where the day is. */
function lineCity(dest: { docType: DocType }, day: PlanDay): string {
  const city = clean(day.city)
  const night = clean(day.overnight_city)
  const bed = night && !ON_BOARD.test(night) ? night : ''
  if (dest.docType === 'hotel_voucher') return bed || city
  return city || bed
}

const toNumber = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : null
}

export function planDocuments(days: readonly PlanDay[], suppliers: Record<string, PlanSupplier>): {
  docs: PlannedDoc[]
  excluded: ExcludedLine[]
  totalLines: number
} {
  type Bucket = { key: string; docType: DocType; kind?: OrderKind; title: string; supplierId: string | null; lines: DocLine[]; nights: number[] }
  const buckets = new Map<string, Bucket>()
  const excluded: ExcludedLine[] = []
  let totalLines = 0
  const sorted = [...days].sort((a, b) => a.day_number - b.day_number)

  for (const day of sorted) {
    const services = day.services ?? []
    const nightProperty = overnightProperty(services as never)
    for (const s of services) {
      totalLines++
      const dest = destinationOf(s)
      const city = 'excluded' in dest ? clean(day.city) : lineCity(dest, day)
      const base = { service_id: s.id, service_type: s.service_type ?? null, quantity: s.quantity ?? null, date: day.date ?? null, day_number: day.day_number, city, notes: s.notes ?? null, total_cost: toNumber(s.total_cost) }
      if ('excluded' in dest) {
        excluded.push({ line: { ...base, service_name: clean(s.service_name) || 'Service' }, reason: dest.excluded })
        continue
      }
      const name = dest.kind === 'entrance' ? entranceLineName(s, day.attractions) : clean(s.service_name) || 'Service'
      const line: DocLine = { ...base, service_name: name }

      const supplier = s.supplier_id ? suppliers[s.supplier_id] : undefined
      const isNight = dest.docType === 'hotel_voucher' || dest.docType === 'cruise_voucher'
      // Nights group by the property (the guide's bed goes with the night's
      // hotel), work by kind; a supplier on the line makes it theirs.
      const property = isNight
        ? (propertyFromService(s as never)?.name ?? nightProperty?.name ?? `${DOC_TITLES[dest.docType as 'hotel_voucher']}${city ? ` — ${city}` : ''}`)
        : null
      const who = supplier ? `s:${supplier.id}` : isNight ? `p:${property!.toLowerCase()}` : `k:${dest.kind ?? ''}`
      const key = `${dest.docType}|${who}`
      const title = supplier ? clean(supplier.name) || 'Supplier'
        : isNight ? property!
        : dest.docType === 'service_order' ? ORDER_TITLES[dest.kind ?? 'other']
        : DOC_TITLES[dest.docType]

      let bucket = buckets.get(key)
      if (!bucket) buckets.set(key, bucket = { key, docType: dest.docType, kind: dest.kind, title, supplierId: supplier?.id ?? null, lines: [], nights: [] })
      bucket.lines.push(line)
      if (isNight) bucket.nights.push(day.day_number)
    }
  }

  const docs: PlannedDoc[] = []
  for (const b of buckets.values()) {
    if (b.docType === 'hotel_voucher' || b.docType === 'cruise_voucher') {
      // One voucher per STAY: a break in the nights is a second stay (Cairo
      // at the start of the trip and again at the end).
      const nights = [...new Set(b.nights)].sort((x, y) => x - y)
      const stays: number[][] = []
      for (const n of nights) {
        const last = stays[stays.length - 1]
        if (last && n === last[last.length - 1] + 1) last.push(n)
        else stays.push([n])
      }
      for (const stay of stays) {
        const lines = b.lines.filter(l => stay.includes(l.day_number))
        docs.push(finish({ ...b, key: stays.length > 1 ? `${b.key}|n${stay[0]}` : b.key, lines }, true))
      }
    } else {
      docs.push(finish(b, false))
    }
  }
  docs.sort((a, b) => (a.firstDate ?? '').localeCompare(b.firstDate ?? '') || a.title.localeCompare(b.title))
  return { docs, excluded, totalLines }
}

function finish(b: { key: string; docType: DocType; kind?: OrderKind; title: string; supplierId: string | null; lines: DocLine[] }, nights: boolean): PlannedDoc {
  const lines = [...b.lines].sort((x, y) => x.day_number - y.day_number)
  const dates = lines.map(l => l.date).filter((d): d is string => !!d).sort()
  const firstDate = dates[0] ?? null
  const lastDate = dates[dates.length - 1] ?? null
  return {
    key: b.key, docType: b.docType, kind: b.kind, title: b.title, supplierId: b.supplierId, lines,
    cities: [...new Set(lines.map(l => l.city).filter(Boolean))],
    firstDate, lastDate,
    checkOut: nights && lastDate ? addDays(lastDate, 1) : null,
    totalCost: Math.round(lines.reduce((sum, l) => sum + (l.total_cost ?? 0), 0) * 100) / 100,
  }
}

// ── Has a document been touched since the app wrote it? ─────────────────────

/** Canonical JSON: key order never changes the hash (jsonb reorders keys). */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v as object).sort().map(k => [k, canonical((v as Record<string, unknown>)[k])]))
  }
  return v
}

export function linesHash(lines: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(lines ?? []))).digest('hex').slice(0, 32)
}

// ── Reconcile: the plan against the documents that exist ────────────────────

export interface ExistingDoc {
  id: string
  document_type: string
  document_number?: string | null
  supplier_id: string | null
  supplier_name: string | null
  status: string
  services: unknown
  sync_key: string | null
  synced_hash: string | null
}

export type AttentionReason =
  | 'edited_and_changed'    // a draft a person edited; the trip changed since
  | 'sent_and_changed'      // sent or confirmed; the trip changed since
  | 'no_longer_on_trip'     // sent/edited, and the trip no longer has these services
  | 'made_before_sync'      // sent before sync existed; check it against the trip

export interface Attention { docId: string; documentNumber: string | null; title: string; status: string; reason: AttentionReason; plannedKey: string | null }

export interface Reconciliation {
  create: PlannedDoc[]
  update: { docId: string; planned: PlannedDoc }[]
  retire: { docId: string; why: 'not_needed' | 'replaced_older_draft' }[]
  inSync: { docId: string; planned: PlannedDoc }[]
  attention: Attention[]
}

const LIVE = (d: ExistingDoc) => d.status !== 'cancelled'
const untouched = (d: ExistingDoc) => !!d.synced_hash && d.synced_hash === linesHash(d.services)
const sameLines = (d: ExistingDoc, p: PlannedDoc) => linesHash(d.services) === linesHash(p.lines)

/**
 * What Sync does. Never overwrites a document a person edited or sent: it is
 * reported (attention) with what changed, and `force` — the person's own
 * "Replace with the itinerary's version" — is the only way it is rewritten.
 */
export function reconcileDocuments(
  planned: readonly PlannedDoc[],
  existing: readonly ExistingDoc[],
  opts: { onlyTypes?: readonly string[] | null; force?: readonly string[] } = {},
): Reconciliation {
  const inScope = (t: string) => !opts.onlyTypes || opts.onlyTypes.includes(t)
  const force = new Set(opts.force ?? [])
  const out: Reconciliation = { create: [], update: [], retire: [], inSync: [], attention: [] }
  const live = existing.filter(LIVE).filter(d => inScope(d.document_type))
  const claimed = new Set<string>()

  // Documents made before Sync (no key) that were SENT: adopt one per planned
  // document — same supplier and type, or, with no supplier, the same type
  // and kind — so nothing already sent is sent twice.
  const legacySent = live.filter(d => !d.sync_key && d.status !== 'draft')
  const adoptFor = (p: PlannedDoc): ExistingDoc | undefined => legacySent.find(d =>
    !claimed.has(d.id) && d.document_type === p.docType &&
    (p.supplierId ? d.supplier_id === p.supplierId : !d.supplier_id && legacyKind(d) === (p.kind ?? null)))

  for (const p of planned.filter(p => inScope(p.docType))) {
    const doc = live.find(d => d.sync_key === p.key && !claimed.has(d.id)) ?? adoptFor(p)
    if (!doc) { out.create.push(p); continue }
    claimed.add(doc.id)
    const attn = (reason: AttentionReason) => out.attention.push({ docId: doc.id, documentNumber: doc.document_number ?? null, title: p.title, status: doc.status, reason, plannedKey: p.key })
    if (force.has(doc.id)) { out.update.push({ docId: doc.id, planned: p }); continue }
    if (sameLines(doc, p)) {
      if (doc.sync_key) out.inSync.push({ docId: doc.id, planned: p })
      else attn('made_before_sync')
      continue
    }
    if (!doc.sync_key) { attn('made_before_sync'); continue }
    if (doc.status === 'draft' && untouched(doc)) { out.update.push({ docId: doc.id, planned: p }); continue }
    attn(doc.status === 'draft' ? 'edited_and_changed' : 'sent_and_changed')
  }

  for (const doc of live.filter(d => !claimed.has(d.id))) {
    if (doc.status === 'draft' && (!doc.sync_key || untouched(doc) || force.has(doc.id))) {
      // A draft the app made that the trip no longer needs — or an older
      // per-city draft the synced set replaces. Kept, as Cancelled.
      out.retire.push({ docId: doc.id, why: doc.sync_key ? 'not_needed' : 'replaced_older_draft' })
    } else {
      out.attention.push({ docId: doc.id, documentNumber: doc.document_number ?? null, title: doc.supplier_name ?? '', status: doc.status, reason: 'no_longer_on_trip', plannedKey: null })
    }
  }
  return out
}

/** An older unassigned service order's kind, from its title. */
function legacyKind(d: ExistingDoc): OrderKind | null {
  if (d.document_type !== 'service_order') return null
  const t = clean(d.supplier_name)
  if (/restaurant|meal/i.test(t)) return 'meals'
  if (/entrance/i.test(t)) return 'entrance'
  return 'other'
}

// ── Coverage: what the person sees ──────────────────────────────────────────

export interface CoverageWarning { kind: 'night_without_hotel' | 'trip_without_transport' | 'day_without_transport'; dayNumber?: number; message: string }

/**
 * Nights and days that look unplanned — not a document problem, a trip
 * problem the documents would otherwise hide: a night with no hotel line
 * when other nights have one; sightseeing with no vehicle.
 */
export function coverageWarnings(days: readonly PlanDay[]): CoverageWarning[] {
  const sorted = [...days].sort((a, b) => a.day_number - b.day_number)
  const has = (d: PlanDay, t: DocType) => (d.services ?? []).some(s => { const x = destinationOf(s); return !('excluded' in x) && x.docType === t })
  const warnings: CoverageWarning[] = []
  const nights = sorted.slice(0, -1)
  const stayed = nights.filter(d => has(d, 'hotel_voucher') || has(d, 'cruise_voucher'))
  if (stayed.length > 0) {
    for (const d of nights) {
      if (has(d, 'hotel_voucher') || has(d, 'cruise_voucher')) continue
      const where = clean(d.overnight_city) || clean(d.city)
      warnings.push({ kind: 'night_without_hotel', dayNumber: d.day_number, message: `Night ${d.day_number}${where ? ` (${where})` : ''} has no hotel or cruise line, so no voucher can book it.` })
    }
  }
  const busy = (d: PlanDay) => (d.services ?? []).some(s => { const x = destinationOf(s); return !('excluded' in x) && (x.docType === 'guide_assignment' || x.kind === 'entrance' || x.kind === 'activities') })
  const moved = sorted.filter(d => has(d, 'transport_voucher'))
  if (moved.length === 0) {
    if (sorted.some(busy)) warnings.push({ kind: 'trip_without_transport', message: 'This trip has sightseeing but no transport line, so there is no transport voucher.' })
  } else {
    // A cruise day's sightseeing comes with the cruise (its excursions), so a
    // day on board — or the morning after a night on board — needs no vehicle.
    const onCruise = (d: PlanDay, i: number) =>
      has(d, 'cruise_voucher') || ON_BOARD.test(clean(d.overnight_city)) || (i > 0 && has(sorted[i - 1], 'cruise_voucher'))
    for (const [i, d] of sorted.entries()) {
      if (busy(d) && !has(d, 'transport_voucher') && !onCruise(d, i)) {
        warnings.push({ kind: 'day_without_transport', dayNumber: d.day_number, message: `Day ${d.day_number}${clean(d.city) ? ` (${clean(d.city)})` : ''} has sightseeing but no transport line.` })
      }
    }
  }
  return warnings
}
