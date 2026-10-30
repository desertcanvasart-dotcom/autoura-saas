// ============================================
// A booking's service bookings — one per service line
// ============================================
// booking_supplier_status holds the booking's SERVICE BOOKINGS (446/447):
// one row per service line of the itinerary (a car, a guide, a lunch, an
// airport meet-and-assist, a hotel night), each moving pending → requested →
// accepted → assigned → done (lib/bookings/service-booking-states.ts).
// Before 446 it held one row per supplier per day, costs summed; those rows
// are replaced by per-line ones the next time the booking is synced, unless
// someone has already worked on them (then they stay, and cover their lines).
//
// Here:
//   * lines nobody confirms (tips, water, supplies, fees, entrance tickets
//     bought at the gate) are left out;
//   * a row marked cancelled = "not needed" and does not count;
//   * BACKED = at least one row still needed, and every one covered
//     (accepted, assigned or done) — an empty list is not backing ("all zero
//     suppliers confirmed" is the claim that made the sibling add this rule).

import type { SupabaseClient } from '@supabase/supabase-js'
import { supplierOwnMoney, type OwnCurrencyLine } from '@/lib/supplier-own-currency'
import { isCancelled, isCovered } from '@/lib/bookings/service-booking-states'
import { eventRow } from '@/lib/bookings/service-booking-events'


export interface SupplierBacking {
  /** Rows still needed (not cancelled). */
  total: number
  confirmed: number
  backed: boolean
}

export function supplierBacking(rows: { status: string | null }[] | null | undefined): SupplierBacking {
  const needed = (rows ?? []).filter(r => !isCancelled(r.status))
  const confirmed = needed.filter(r => isCovered(r.status)).length
  return { total: needed.length, confirmed, backed: needed.length > 0 && confirmed === needed.length }
}

/** Service type → supplier type; null = nobody to confirm, left off. */
export function supplierTypeFor(serviceType: string | null | undefined): string | null {
  const t = (serviceType ?? '').toLowerCase()
  const map: Record<string, string | null> = {
    hotel: 'hotel', accommodation: 'hotel',
    guide: 'guide', tour_guide: 'guide',
    transport: 'transport', transportation: 'transport', transfer: 'transport', vehicle: 'transport',
    train: 'transport', sleeping_train: 'transport',
    restaurant: 'restaurant', meal: 'restaurant', lunch: 'restaurant', dinner: 'restaurant', breakfast: 'restaurant',
    activity: 'activity', excursion: 'activity', tour: 'activity',
    // Tickets are bought at the gate: nobody confirms them.
    entrance: null, entrance_fee: null, ticket: null,
    cruise: 'cruise', nile_cruise: 'cruise',
    flight: 'flight', domestic_flight: 'flight',
    tips: null, tip: null, water: null, supplies: null, service_fee: null, other: null,
  }
  return t in map ? map[t] : null
}

export interface ServiceForSupplier extends OwnCurrencyLine {
  id?: string | null
  supplier_id?: string | null
  supplier_name?: string | null
  service_name?: string | null
  service_type?: string | null
  description?: string | null
  notes?: string | null
  total_cost?: number | string | null
  pickup_time?: string | null
  pickup_location?: string | null
  dropoff_location?: string | null
  rate_table?: string | null
  rate_id?: string | null
  day_number: number
  day_date?: string | null
}

export interface SupplierLine {
  itinerary_service_id: string | null
  supplier_id: string | null
  supplier_type: string
  supplier_name: string
  service_description: string | null
  service_date: string | null
  service_time: string | null
  pickup_location: string | null
  dropoff_location: string | null
  pax: number | null
  quoted_cost: number | null
  /** Currency of quoted_cost (the supplier's own, lib/supplier-own-currency); null = the booking's. */
  cost_currency: string | null
}

/** The currency a line's quoted and confirmed cost are in: its own, else the booking's. */
export function supplierCostCurrency(
  row: { cost_currency?: string | null },
  bookingCurrency: string | null | undefined,
): string {
  return String(row.cost_currency || bookingCurrency || 'EUR').trim().toUpperCase()
}

export function serviceDate(dayNumber: number, dayDate: string | null | undefined, tripStart: string | null | undefined): string | null {
  if (dayDate) return dayDate.slice(0, 10)
  if (!tripStart) return null
  const d = new Date(`${tripStart.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + (dayNumber - 1))
  return d.toISOString().slice(0, 10)
}

/** Supplier + type + day: how pre-446 rows were grouped, used to match them to lines. */
export function supplierKey(l: { supplier_id?: string | null; supplier_name?: string | null; supplier_type?: string | null; service_date?: string | null }): string {
  const date = l.service_date ?? 'no-date'
  return l.supplier_id
    ? `id:${l.supplier_id}|${l.supplier_type ?? ''}|${date}`
    : `name:${(l.supplier_name ?? '').trim().toLowerCase()}|${l.supplier_type ?? ''}|${date}`
}

/**
 * The booking's service bookings implied by its itinerary: one per line that
 * needs a supplier. The cost is in the supplier's OWN currency (EGP for a
 * guide, USD for a Nile cruise…) when the line was priced in one with the
 * rate it was converted at — what the supplier is paid
 * (lib/supplier-own-currency); otherwise the line's total_cost in the trip's
 * currency (`tripCurrency`), and cost_currency null = the booking's.
 */
export function supplierLinesFromServices(
  services: ServiceForSupplier[],
  tripStart: string | null | undefined,
  pax: number | null = null,
  tripCurrency: string | null = null,
): SupplierLine[] {
  const trip = String(tripCurrency ?? '').trim().toUpperCase()
  const lines: SupplierLine[] = []
  for (const s of services) {
    // The grid saves a cruise as 'accommodation'; its slot tag says cruise.
    const isGridCruise = String(s.description ?? '').startsWith('[pricing-grid:cruise]')
    const type = isGridCruise ? 'cruise' : supplierTypeFor(s.service_type)
    if (!type) continue
    const money = trip ? supplierOwnMoney([s], trip) : null
    lines.push({
      itinerary_service_id: s.id || null,
      supplier_id: s.supplier_id || null,
      supplier_type: type,
      // No supplier yet = no name: the service goes in the description, never
      // into the supplier's place (lib/bookings/service-label).
      supplier_name: (s.supplier_name || '').trim(),
      service_description: s.notes || s.service_name || null,
      service_date: serviceDate(s.day_number, s.day_date, tripStart),
      service_time: s.pickup_time || null,
      pickup_location: s.pickup_location || null,
      dropoff_location: s.dropoff_location || null,
      pax: pax && pax > 0 ? pax : null,
      quoted_cost: money?.own ? money.total : (Number(s.total_cost) || null),
      cost_currency: money?.own ? money.currency : null,
    })
  }
  return lines.sort((a, b) =>
    (a.service_date ?? '').localeCompare(b.service_date ?? '') || (a.service_time ?? '').localeCompare(b.service_time ?? ''))
}

// ============================================
// The supplier is the one whose rate priced the line
// ============================================
// The engine prices a line from a rate row (itinerary_services.rate_table +
// rate_id) and the rate sheets carry supplier_id — but the line itself was
// saved without it, so a service booking showed only the service's name.
// The supplier is read from that rate row: a fact, never a guess. A line with
// no pin, or a rate row naming no supplier, stays as it is (no supplier yet).

/** Rate sheets that name a supplier (each has a supplier_id column). */
export const SUPPLIER_RATE_TABLES = [
  'accommodation_rates', 'activity_rates', 'airport_staff_rates', 'flight_rates', 'guide_rates',
  'hotel_staff_rates', 'meal_rates', 'nile_cruises', 'sleeping_train_rates', 'train_rates', 'transportation_rates',
] as const

export const rateKey = (table: string, id: string) => `${table}:${id}`

/** Pure: each line without a supplier takes the one its rate row names. */
export function withSupplierFromRate(
  services: ServiceForSupplier[],
  rateSupplier: Map<string, { id: string; name: string }>,
): ServiceForSupplier[] {
  return services.map(s => {
    if (s.supplier_id || !s.rate_table || !s.rate_id) return s
    const found = rateSupplier.get(rateKey(s.rate_table, s.rate_id))
    if (!found) return s
    return { ...s, supplier_id: found.id, supplier_name: found.name }
  })
}

export interface ExistingServiceRow {
  id: string
  itinerary_service_id: string | null
  supplier_id: string | null
  supplier_name: string
  supplier_type: string
  service_date: string | null
  status: string | null
  confirmation_number: string | null
  confirmed_cost: number | string | null
  has_expense: boolean
}

/**
 * Pure: which lines to add and which pre-446 rows to replace.
 *   * a line already on the booking (by its itinerary line) is skipped;
 *   * a pre-446 row (no itinerary line) still pending and untouched — no
 *     confirmation number, no confirmed cost, no expense — is replaced by its
 *     lines, or simply removed when it was a ticket (no longer listed);
 *   * a pre-446 row someone worked on stays, and the lines it groups are not
 *     added again;
 *   * a pre-446 row matching nothing in the itinerary (added by hand) stays.
 */
export function planLineSync(
  lines: SupplierLine[],
  existing: ExistingServiceRow[],
  /** Per itinerary line, the key its pre-446 row was grouped under when that differs (named by service, before its supplier was known). */
  earlierKey: Map<string, string> = new Map(),
): { add: SupplierLine[]; replace: string[] } {
  const keysOf = (l: SupplierLine) => {
    const k = [supplierKey(l)]
    const e = l.itinerary_service_id ? earlierKey.get(l.itinerary_service_id) : undefined
    if (e && e !== k[0]) k.push(e)
    return k
  }
  const haveLine = new Set(existing.map(r => r.itinerary_service_id).filter(Boolean) as string[])
  const lineKeys = new Set(lines.flatMap(keysOf))
  const replace: string[] = []
  const coveredKeys = new Set<string>()
  for (const r of existing) {
    if (r.itinerary_service_id) continue
    const key = supplierKey(r)
    const untouched = (r.status ?? 'pending') === 'pending' && !r.confirmation_number
      && (r.confirmed_cost === null || r.confirmed_cost === '') && !r.has_expense
    const wasTicket = r.supplier_type === 'entrance'
    if (untouched && (lineKeys.has(key) || wasTicket)) replace.push(r.id)
    else coveredKeys.add(key)
  }
  const add = lines.filter(l =>
    !(l.itinerary_service_id && haveLine.has(l.itinerary_service_id)) && !keysOf(l).some(k => coveredKeys.has(k)))
  return { add, replace }
}

/**
 * Bring the booking's service bookings in line with its itinerary (above).
 * Idempotent. `db` is scoped by the caller: the RLS client from a route, the
 * admin client at booking creation (then tenantId filters). Each new row
 * starts its history with an event.
 */
export async function syncBookingSuppliers(
  db: SupabaseClient,
  tenantId: string,
  bookingId: string,
  actor: { actor: 'operator' | 'system'; actorUserId?: string | null; actorLabel?: string | null } = { actor: 'system' },
): Promise<{ ok: true; added: number; replaced: number } | { ok: false; error: string }> {
  const { data: booking } = await db
    .from('bookings')
    .select('id, itinerary_id, start_date, num_travelers')
    .eq('id', bookingId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!booking) return { ok: false, error: 'Booking not found' }
  if (!booking.itinerary_id) return { ok: true, added: 0, replaced: 0 }

  const [{ data: days }, { data: services }, { data: existing }] = await Promise.all([
    db.from('itinerary_days').select('id, day_number, date').eq('itinerary_id', booking.itinerary_id),
    db.from('itinerary_services')
      .select('id, supplier_id, supplier_name, service_name, service_type, description, notes, total_cost, quantity, supplier_currency, supplier_cost_original, exchange_rate_used, pickup_time, pickup_location, dropoff_location, rate_table, rate_id, itinerary_day_id, day_id')
      .eq('itinerary_id', booking.itinerary_id),
    db.from('booking_supplier_status')
      .select('id, itinerary_service_id, supplier_id, supplier_name, supplier_type, service_date, status, confirmation_number, confirmed_cost')
      .eq('booking_id', bookingId),
  ])

  const dayById = new Map((days ?? []).map(d => [d.id as string, d]))
  const rows: ServiceForSupplier[] = []
  for (const s of services ?? []) {
    const day = dayById.get((s.itinerary_day_id || s.day_id) as string)
    if (!day) continue
    rows.push({ ...s, day_number: day.day_number as number, day_date: day.date as string | null })
  }

  const existingIds = (existing ?? []).map(r => r.id as string)
  const withExpense = new Set<string>()
  if (existingIds.length) {
    const { data: expenses } = await db.from('expenses').select('booking_supplier_status_id').in('booking_supplier_status_id', existingIds)
    for (const e of expenses ?? []) withExpense.add(e.booking_supplier_status_id as string)
  }

  const pax = Number(booking.num_travelers) || null
  // The currency the services' total_cost is in: the trip's.
  const { data: trip } = await db.from('itineraries').select('currency').eq('id', booking.itinerary_id).maybeSingle()
  const tripCurrency = (trip?.currency as string | null) ?? null
  const rateSupplier = await suppliersFromRates(db, tenantId, rows)
  const earlierKey = new Map(
    supplierLinesFromServices(rows, booking.start_date as string | null, pax)
      .filter(l => l.itinerary_service_id)
      .map(l => [l.itinerary_service_id as string, supplierKey(l)]),
  )
  const plan = planLineSync(
    supplierLinesFromServices(withSupplierFromRate(rows, rateSupplier), booking.start_date as string | null, pax, tripCurrency),
    (existing ?? []).map(r => ({ ...r, has_expense: withExpense.has(r.id as string) }) as ExistingServiceRow),
    earlierKey,
  )

  if (plan.replace.length) {
    const { error } = await db.from('booking_supplier_status').delete().in('id', plan.replace).eq('booking_id', bookingId).eq('status', 'pending')
    if (error) return { ok: false, error: error.message }
  }
  if (plan.add.length === 0) return { ok: true, added: 0, replaced: plan.replace.length }

  const { data: inserted, error } = await db.from('booking_supplier_status')
    .insert(plan.add.map(l => ({ ...l, tenant_id: tenantId, booking_id: bookingId, status: 'pending', resource_kind: 'supplier' })))
    .select('id')
  if (error) return { ok: false, error: error.message }

  const { error: evErr } = await db.from('service_booking_events').insert((inserted ?? []).map(r => eventRow({
    tenantId, bookingId, serviceBookingId: r.id as string, channel: actor.actor === 'system' ? 'system' : 'app',
    toStatus: 'pending', note: 'Listed from the itinerary', ...actor,
  })))
  if (evErr) console.error('[booking-suppliers] events:', evErr.message)
  return { ok: true, added: plan.add.length, replaced: plan.replace.length }
}

/** The supplier each pinned rate row names (rate table + id → supplier), this company's suppliers only. */
async function suppliersFromRates(
  db: SupabaseClient,
  tenantId: string,
  services: ServiceForSupplier[],
): Promise<Map<string, { id: string; name: string }>> {
  const out = new Map<string, { id: string; name: string }>()
  const idsByTable = new Map<string, Set<string>>()
  for (const s of services) {
    if (s.supplier_id || !s.rate_id || !(SUPPLIER_RATE_TABLES as readonly string[]).includes(s.rate_table ?? '')) continue
    if (!idsByTable.has(s.rate_table as string)) idsByTable.set(s.rate_table as string, new Set())
    idsByTable.get(s.rate_table as string)!.add(s.rate_id)
  }
  if (idsByTable.size === 0) return out

  const supplierOfRate = new Map<string, string>()
  await Promise.all([...idsByTable].map(async ([table, ids]) => {
    const { data, error } = await db.from(table).select('id, supplier_id').in('id', [...ids])
    if (error) { console.error('[booking-suppliers] rate suppliers', table, error.message); return }
    for (const r of (data ?? []) as Array<{ id: string; supplier_id: string | null }>) {
      if (r.supplier_id) supplierOfRate.set(rateKey(table, r.id), r.supplier_id)
    }
  }))
  if (supplierOfRate.size === 0) return out

  const { data: suppliers } = await db.from('suppliers')
    .select('id, name, company_name')
    .in('id', [...new Set(supplierOfRate.values())])
    .eq('tenant_id', tenantId)
  const byId = new Map((suppliers ?? []).map(sp => [sp.id as string, ((sp.name || sp.company_name) as string | null)?.trim() || null]))
  for (const [key, supplierId] of supplierOfRate) {
    const name = byId.get(supplierId)
    if (name) out.set(key, { id: supplierId, name })
  }
  return out
}
