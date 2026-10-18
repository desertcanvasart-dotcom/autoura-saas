// ============================================
// Loading trip P&Ls — the rows lib/trip-pnl.ts computes from
// ============================================
// Moved out of GET /api/profit-loss so the itineraries list's
// needs-attention count reads a trip's money exactly as the P&L report and
// the itinerary page do (invoiced, paid, recorded costs, commissions,
// extras, at the rate of the day). The arithmetic stays in lib/trip-pnl.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadFxContext, collectCurrencies, resolveReportingCurrency } from '@/lib/fx-report'
import {
  computeTripPnL,
  type PnlCommission,
  type PnlExpense,
  type PnlExtra,
  type PnlInvoice,
  type PnlItinerary,
  type TripPnL,
} from '@/lib/trip-pnl'
import { extrasAdmin } from '@/lib/booking-extras-db'
import { fetchAllPages } from '@/lib/db/fetch-all-pages'

/**
 * Above this many itinerary ids, an `.in()` filter makes the query string
 * long enough to risk a PostgREST/proxy URL limit. Past it we fetch
 * tenant-wide (RLS-scoped) and group in memory.
 */
export const MAX_IN_FILTER_IDS = 300

export interface LoadedTripPnls {
  pnlData: TripPnL[]
  reportingCurrency: string
  fxContext: Awaited<ReturnType<typeof loadFxContext>>
  commissionsAvailable: boolean
}

/** A financial read that failed: the report must not show it as nothing. */
export class PnlLoadError extends Error {}

/**
 * Every row of `table` for the given trips: ids in chunks short enough for a
 * URL, each chunk read a page at a time. One unpaged read stopped at the
 * database's 1000-row cap, and past 300 trips the tenant-wide read did too,
 * so a busy agency's costs were silently cut and its profit overstated.
 */
async function readForTrips<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  table: string,
  columns: string,
  ids: string[],
): Promise<{ data: T[]; error: unknown }> {
  const rows: T[] = []
  for (let i = 0; i < ids.length; i += MAX_IN_FILTER_IDS) {
    const chunk = ids.slice(i, i + MAX_IN_FILTER_IDS)
    const { data, error } = await fetchAllPages<T>((from, to) =>
      supabase.from(table).select(columns).in('itinerary_id', chunk).order('id', { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: T[] | null; error: unknown }>
    )
    if (error) return { data: rows, error }
    rows.push(...data)
  }
  return { data: rows, error: null }
}

export async function loadTripPnls(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  itineraries: PnlItinerary[],
  requestedCurrency: string | null,
): Promise<LoadedTripPnls> {
    const itineraryIds = itineraries.map(i => i.id)

    // ---------- Financial rows (RLS filters by tenant) ----------
    const [invoiceResult, expenseResult, commissionResult] = await Promise.all([
      readForTrips<PnlInvoice>(supabase, 'invoices',
        'itinerary_id, invoice_number, total_amount, tax_amount, invoice_type, amount_paid, currency, status, issue_date, paid_at', itineraryIds),
      readForTrips<PnlExpense>(supabase, 'expenses',
        'itinerary_id, expense_number, amount, currency, category, status, expense_date, payment_date, booking_supplier_status_id', itineraryIds),
      readForTrips<PnlCommission>(supabase, 'commissions',
        'itinerary_id, description, source_name, commission_amount, currency, commission_type, category, status, transaction_date, paid_date, due_date', itineraryIds),
    ])

    // Invoices and expenses are the report: if either cannot be read, a
    // trip's revenue fell back to its quote and its costs to 0 — figures
    // that looked real. Refuse instead.
    if (invoiceResult.error) { console.error('Error fetching invoices:', invoiceResult.error); throw new PnlLoadError('Could not read invoices') }
    if (expenseResult.error) { console.error('Error fetching expenses:', expenseResult.error); throw new PnlLoadError('Could not read expenses') }
    // Commissions are new to this report. A tenant whose commissions table is
    // unreadable still gets a P&L — but it must not silently look complete,
    // so the failure is surfaced on the response.
    if (commissionResult.error) console.error('Error fetching commissions:', commissionResult.error)

    const invoices = (invoiceResult.data || []) as PnlInvoice[]
    const expenses = (expenseResult.data || []) as PnlExpense[]
    const commissions = (commissionResult.data || []) as PnlCommission[]

    // ---------- Extras sold after the trips were priced (migration 321) ----------
    // CONFIRMED booking_extras, joined to the trip through bookings.itinerary_id.
    // A database without the table contributes nothing rather than 500ing.
    const extrasByTrip = new Map<string, PnlExtra[]>()
    if (itineraryIds.length) {
      // Service-role read (the table is not RLS-readable by staff), so it is
      // scoped to the tenant explicitly; and every trip, not the first 300.
      const tenantId = tenantIdOf(itineraries)
      const extraRows: Array<PnlExtra & { bookings: { itinerary_id?: string } | null }> = []
      for (let i = 0; i < itineraryIds.length; i += MAX_IN_FILTER_IDS) {
        let q = extrasAdmin()
          .from('booking_extras')
          .select('title, quantity, unit_price, currency, supplier_cost, supplier_currency, confirmed_at, bookings!inner(itinerary_id, tenant_id)')
          .eq('status', 'confirmed')
          .in('bookings.itinerary_id', itineraryIds.slice(i, i + MAX_IN_FILTER_IDS))
        if (tenantId) q = q.eq('bookings.tenant_id', tenantId)
        const { data, error: extrasError } = await q
        if (extrasError) { console.error('profit-loss: could not read booking extras', extrasError); break }
        extraRows.push(...((data ?? []) as unknown as typeof extraRows))
      }
      for (const row of extraRows) {
        const itinId = row.bookings?.itinerary_id
        if (!itinId) continue
        const list = extrasByTrip.get(itinId) ?? []
        list.push(row)
        extrasByTrip.set(itinId, list)
      }
    }

    // ---------- Exchange rates (shared loader, see lib/fx-report.ts) ----------
    const reportingCurrency = resolveReportingCurrency(
      itineraries as PnlItinerary[],
      requestedCurrency
    )
    const fxContext = await loadFxContext(supabase, {
      // The extras' currencies too: a USD extra on a EUR-only agency's trip
      // found no rate and its cost was dropped.
      currencies: [...new Set([
        ...collectCurrencies(itineraries as PnlItinerary[], invoices, expenses, commissions),
        ...[...extrasByTrip.values()].flat().flatMap(x => [x.currency, x.supplier_currency])
          .filter((c): c is string => !!c).map(c => c.trim().toUpperCase()),
      ])],
      reportingCurrency,
    })
    const { fxIndex, liveRate } = fxContext

    // ---------- Group rows by trip ----------
    const invoicesByTrip = new Map<string, PnlInvoice[]>()
    const expensesByTrip = new Map<string, PnlExpense[]>()
    const commissionsByTrip = new Map<string, PnlCommission[]>()

    function pushInto<T extends { itinerary_id: string | null }>(
      map: Map<string, T[]>,
      rows: T[]
    ): void {
      for (const row of rows) {
        if (!row.itinerary_id) continue
        const bucket = map.get(row.itinerary_id)
        if (bucket) bucket.push(row)
        else map.set(row.itinerary_id, [row])
      }
    }

    pushInto(invoicesByTrip, invoices)
    pushInto(expensesByTrip, expenses)
    pushInto(commissionsByTrip, commissions)

    // ---------- Compute ----------
    const pnlData: TripPnL[] = itineraries.map(itinerary =>
      computeTripPnL({
        itinerary,
        invoices: invoicesByTrip.get(itinerary.id) || [],
        expenses: expensesByTrip.get(itinerary.id) || [],
        commissions: commissionsByTrip.get(itinerary.id) || [],
        extras: extrasByTrip.get(itinerary.id) || [],
        fxIndex,
        liveRate,
      })
    )


  return {
    pnlData,
    reportingCurrency,
    fxContext,
    commissionsAvailable: !commissionResult.error,
  }
}

/** The tenant of the trips, when the rows carry it. */
function tenantIdOf(itineraries: PnlItinerary[]): string | null {
  const t = (itineraries[0] as { tenant_id?: string | null } | undefined)?.tenant_id
  return t ?? null
}
