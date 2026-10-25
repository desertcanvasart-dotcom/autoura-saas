// ============================================
// A booking's suppliers — who has to confirm what, and whether they have
// ============================================
// booking_supplier_status holds one row per supplier per service date, each
// pending → contacted → confirmed (or no_response / cancelled). Until now
// nothing showed it and nothing filled it: the rows were made only by a
// sync route no screen called, one per service LINE (a grid trip's eleven
// water lines became eleven "suppliers"), and a booking was never checked
// against them. (Compared with travel-ops-pro, 2026-09-25.)
//
// Here:
//   * lines nobody confirms (tips, water, supplies, fees) are left out;
//   * the same supplier on the same day is ONE row (by supplier_id when the
//     line is linked, else by name), its costs summed;
//   * the cost is in the supplier's OWN currency (EGP for a guide, USD for a
//     cruise…) when every line of the row is in that one currency and has
//     the rate it was converted at (lib/supplier-own-currency) — that is what
//     the supplier confirms and is paid. Otherwise it is the lines'
//     total_cost, in the trip's currency. cost_currency says which; null =
//     the booking's currency (rows from before it, rows added by hand);
//   * a row marked cancelled = "not needed" and does not count;
//   * BACKED = at least one row still needed, and every one confirmed — an
//     empty list is not backing ("all zero suppliers confirmed" is the claim
//     that made the sibling add this rule).

import type { SupabaseClient } from '@supabase/supabase-js'
import { supplierOwnMoney, type OwnCurrencyLine } from '@/lib/supplier-own-currency'

export type SupplierRowStatus = 'pending' | 'contacted' | 'confirmed' | 'no_response' | 'cancelled'

export interface SupplierBacking {
  /** Rows still needed (not cancelled). */
  total: number
  confirmed: number
  backed: boolean
}

export function supplierBacking(rows: { status: string | null }[] | null | undefined): SupplierBacking {
  const needed = (rows ?? []).filter(r => r.status !== 'cancelled')
  const confirmed = needed.filter(r => r.status === 'confirmed').length
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
    entrance: 'entrance', entrance_fee: 'entrance', ticket: 'entrance',
    cruise: 'cruise', nile_cruise: 'cruise',
    flight: 'flight', domestic_flight: 'flight',
    tips: null, tip: null, water: null, supplies: null, service_fee: null, other: null,
  }
  return t in map ? map[t] : null
}

export interface ServiceForSupplier extends OwnCurrencyLine {
  supplier_id?: string | null
  supplier_name?: string | null
  service_name?: string | null
  service_type?: string | null
  description?: string | null
  notes?: string | null
  total_cost?: number | string | null
  day_number: number
  day_date?: string | null
}

export interface SupplierLine {
  supplier_id: string | null
  supplier_type: string
  supplier_name: string
  service_description: string | null
  service_date: string | null
  quoted_cost: number | null
  /** Currency of quoted_cost; null = the booking's currency. */
  cost_currency: string | null
}

/** The currency a row's quoted and confirmed cost are in: its own, else the booking's. */
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

export function supplierKey(l: { supplier_id?: string | null; supplier_name?: string | null; supplier_type?: string | null; service_date?: string | null }): string {
  const date = l.service_date ?? 'no-date'
  return l.supplier_id
    ? `id:${l.supplier_id}|${l.supplier_type ?? ''}|${date}`
    : `name:${(l.supplier_name ?? '').trim().toLowerCase()}|${l.supplier_type ?? ''}|${date}`
}

/**
 * The booking's supplier rows implied by its itinerary's services.
 * `tripCurrency` is the currency the services' total_cost is in (the
 * itinerary's); without it, every row gets cost_currency null (= the
 * booking's) at the lines' total_cost.
 */
export function supplierLinesFromServices(
  services: ServiceForSupplier[],
  tripStart: string | null | undefined,
  tripCurrency?: string | null,
): SupplierLine[] {
  const trip = String(tripCurrency ?? '').trim().toUpperCase()
  const byKey = new Map<string, { line: SupplierLine; group: ServiceForSupplier[] }>()
  for (const s of services) {
    // The grid saves a cruise as 'accommodation'; its slot tag says cruise.
    const isGridCruise = String(s.description ?? '').startsWith('[pricing-grid:cruise]')
    const type = isGridCruise ? 'cruise' : supplierTypeFor(s.service_type)
    if (!type) continue
    const line: SupplierLine = {
      supplier_id: s.supplier_id || null,
      supplier_type: type,
      supplier_name: (s.supplier_name || s.service_name || 'Unknown').trim(),
      service_description: s.notes || null,
      service_date: serviceDate(s.day_number, s.day_date, tripStart),
      quoted_cost: null,
      cost_currency: null,
    }
    const key = supplierKey(line)
    const seen = byKey.get(key)
    if (seen) seen.group.push(s)
    else byKey.set(key, { line, group: [s] })
  }
  const lines = [...byKey.values()].map(({ line, group }): SupplierLine => {
    // Only with a known trip currency: "foreign" means foreign to it.
    const money = trip ? supplierOwnMoney(group, trip) : null
    if (money?.own) return { ...line, quoted_cost: money.total || null, cost_currency: money.currency }
    const sum = group.reduce((acc, s) => acc + (Number(s.total_cost) || 0), 0)
    return { ...line, quoted_cost: Math.round(sum * 100) / 100 || null, cost_currency: trip || null }
  })
  return lines.sort((a, b) => (a.service_date ?? '').localeCompare(b.service_date ?? ''))
}

/**
 * Add the rows the booking's itinerary implies and it does not have yet.
 * Idempotent (keyed as above). `db` is scoped by the caller: the RLS client
 * from a route, the admin client at booking creation (then tenantId filters).
 */
export async function syncBookingSuppliers(
  db: SupabaseClient,
  tenantId: string,
  bookingId: string,
): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const { data: booking } = await db
    .from('bookings')
    .select('id, itinerary_id, start_date')
    .eq('id', bookingId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!booking) return { ok: false, error: 'Booking not found' }
  if (!booking.itinerary_id) return { ok: true, added: 0 }

  const [{ data: itinerary }, { data: days }, { data: services }, { data: existing }] = await Promise.all([
    db.from('itineraries').select('currency').eq('id', booking.itinerary_id).maybeSingle(),
    db.from('itinerary_days').select('id, day_number, date').eq('itinerary_id', booking.itinerary_id),
    db.from('itinerary_services')
      .select('supplier_id, supplier_name, service_name, service_type, description, notes, quantity, total_cost, supplier_currency, supplier_cost_original, exchange_rate_used, itinerary_day_id, day_id')
      .eq('itinerary_id', booking.itinerary_id),
    db.from('booking_supplier_status').select('supplier_id, supplier_name, supplier_type, service_date').eq('booking_id', bookingId),
  ])

  const dayById = new Map((days ?? []).map(d => [d.id as string, d]))
  const rows: ServiceForSupplier[] = []
  for (const s of services ?? []) {
    const day = dayById.get((s.itinerary_day_id || s.day_id) as string)
    if (!day) continue
    rows.push({ ...s, day_number: day.day_number as number, day_date: day.date as string | null })
  }

  const have = new Set((existing ?? []).map(supplierKey))
  const fresh = supplierLinesFromServices(rows, booking.start_date as string | null, (itinerary?.currency as string | null) ?? null).filter(l => !have.has(supplierKey(l)))
  if (fresh.length === 0) return { ok: true, added: 0 }

  const { error } = await db.from('booking_supplier_status').insert(
    fresh.map(l => ({ ...l, tenant_id: tenantId, booking_id: bookingId, status: 'pending' })),
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true, added: fresh.length }
}
