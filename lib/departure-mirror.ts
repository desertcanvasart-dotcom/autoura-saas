// ============================================
// DEPARTURE MIRROR — Sawa -> Autoura
// ============================================
// Sawa (the seat-pooling platform, separate repo/DB) owns departures and
// pledges. It POSTs a signed `departure.sync` snapshot on every change;
// this module validates the payload and maps it onto tour_departures.
//
// Status mapping (Sawa -> tour_departures):
//   open               -> open
//   minimum_reached    -> guaranteed (+ is_guaranteed)
//   supplier_confirmed -> guaranteed (+ is_guaranteed)
//   closed             -> full
//   cancelled          -> cancelled
//   pending_review     -> NOT mirrored (Sawa-internal; skip)
//
// Pure functions are exported for unit tests; the upsert takes an
// injected Supabase client (service role — webhooks have no session).
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'

export const MIRROR_SOURCE = 'sawa'

export interface DepartureSyncPayload {
  brand?: string
  event?: string
  departure?: {
    externalId?: string | number
    route?: string
    type?: string
    date?: string
    endDate?: string | null
    time?: string | null
    city?: string | null
    minSeats?: number
    maxSeats?: number
    seatsTaken?: number
    status?: string
    priceFrom?: number | null
    currency?: string | null
  }
  [key: string]: unknown
}

export interface SyncValidationError { field: string; message: string }

const SAWA_STATUSES = ['open', 'minimum_reached', 'supplier_confirmed', 'closed', 'cancelled', 'pending_review']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function validateDepartureSync(body: unknown):
  | { ok: true; payload: DepartureSyncPayload }
  | { ok: false; errors: SyncValidationError[] } {
  const errors: SyncValidationError[] = []
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, errors: [{ field: '(root)', message: 'Payload must be a JSON object.' }] }
  }
  const p = body as DepartureSyncPayload
  const d = p.departure
  if (typeof p.brand !== 'string' || !p.brand.trim()) {
    errors.push({ field: 'brand', message: 'brand is required (maps to a tenant).' })
  }
  if (typeof d !== 'object' || d === null) {
    errors.push({ field: 'departure', message: 'departure object is required.' })
    return { ok: false, errors }
  }
  if (d.externalId === undefined || d.externalId === null || String(d.externalId).trim() === '') {
    errors.push({ field: 'departure.externalId', message: 'externalId is required.' })
  }
  if (typeof d.route !== 'string' || !d.route.trim()) {
    errors.push({ field: 'departure.route', message: 'route is required.' })
  }
  if (typeof d.date !== 'string' || !DATE_RE.test(d.date)) {
    errors.push({ field: 'departure.date', message: 'date (YYYY-MM-DD) is required.' })
  }
  if (d.endDate != null && (typeof d.endDate !== 'string' || !DATE_RE.test(d.endDate))) {
    errors.push({ field: 'departure.endDate', message: 'endDate must be YYYY-MM-DD when present.' })
  }
  if (typeof d.status !== 'string' || !SAWA_STATUSES.includes(d.status)) {
    errors.push({ field: 'departure.status', message: `status must be one of: ${SAWA_STATUSES.join(', ')}.` })
  }
  if (errors.length) return { ok: false, errors }
  return { ok: true, payload: p }
}

export function mapSyncStatus(status: string): { status: string; isGuaranteed: boolean } | null {
  switch (status) {
    case 'open': return { status: 'open', isGuaranteed: false }
    case 'minimum_reached':
    case 'supplier_confirmed': return { status: 'guaranteed', isGuaranteed: true }
    case 'closed': return { status: 'full', isGuaranteed: false }
    case 'cancelled': return { status: 'cancelled', isGuaranteed: false }
    default: return null // pending_review and anything unknown: not mirrored
  }
}

export function durationDays(date: string, endDate?: string | null): number {
  if (!endDate) return 1
  const a = new Date(`${date}T12:00:00Z`).getTime()
  const b = new Date(`${endDate}T12:00:00Z`).getTime()
  const days = Math.round((b - a) / 86400000) + 1
  return Number.isFinite(days) && days >= 1 ? days : 1
}

export type MirrorOutcome = 'created' | 'updated' | 'skipped_pending'

export async function upsertMirroredDeparture(
  supabase: SupabaseClient<any, any, any, any, any>,
  tenantId: string,
  payload: DepartureSyncPayload
): Promise<{ outcome: MirrorOutcome; departureId: string | null }> {
  const d = payload.departure!
  const mapped = mapSyncStatus(String(d.status))
  if (!mapped) return { outcome: 'skipped_pending', departureId: null }

  const externalId = String(d.externalId)
  const row = {
    tenant_id: tenantId,
    external_source: MIRROR_SOURCE,
    external_id: externalId,
    external_synced_at: new Date().toISOString(),
    tour_name: String(d.route).slice(0, 255),
    duration_days: durationDays(d.date!, d.endDate),
    start_date: d.date,
    end_date: d.endDate || d.date,
    min_pax: Number.isFinite(Number(d.minSeats)) ? Number(d.minSeats) : 4,
    max_pax: Number.isFinite(Number(d.maxSeats)) ? Number(d.maxSeats) : 12,
    booked_pax: Number.isFinite(Number(d.seatsTaken)) ? Number(d.seatsTaken) : 0,
    status: mapped.status,
    is_guaranteed: mapped.isGuaranteed,
    price_per_person: Number.isFinite(Number(d.priceFrom)) ? Number(d.priceFrom) : null,
    currency: typeof d.currency === 'string' && d.currency.length === 3 ? d.currency : 'USD',
    public_notes: d.city ? `Mirrored from Sawa · departs ${d.city}${d.time ? ` at ${d.time}` : ''}` : 'Mirrored from Sawa',
  }

  const { data: existing } = await supabase
    .from('tour_departures')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('external_source', MIRROR_SOURCE)
    .eq('external_id', externalId)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await supabase.from('tour_departures').update(row).eq('id', existing.id)
    if (error) throw error
    return { outcome: 'updated', departureId: existing.id as string }
  }
  const { data: inserted, error } = await supabase
    .from('tour_departures')
    .insert(row)
    .select('id')
    .single()
  if (error) throw error
  return { outcome: 'created', departureId: inserted.id as string }
}
