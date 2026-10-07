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

export async function loadTripPnls(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  itineraries: PnlItinerary[],
  requestedCurrency: string | null,
): Promise<LoadedTripPnls> {
    const itineraryIds = itineraries.map(i => i.id)

    // ---------- Financial rows (RLS filters by tenant) ----------
    // Narrow to the itineraries in view so a single-trip report does not pull
    // the tenant's entire financial history. Past a few hundred ids the
    // filter itself becomes a very long query string, so beyond that we fetch
    // tenant-wide (RLS still scopes it) and group in memory instead.
    const scopeToTrips = itineraryIds.length <= MAX_IN_FILTER_IDS
    const scoped = <T>(query: T): T =>
      scopeToTrips
        ? ((query as { in: (col: string, vals: string[]) => T }).in('itinerary_id', itineraryIds))
        : query

    const [invoiceResult, expenseResult, commissionResult] = await Promise.all([
      scoped(
        supabase
          .from('invoices')
          .select('itinerary_id, invoice_number, total_amount, amount_paid, currency, status, issue_date, paid_at')
      ),
      scoped(
        supabase
          .from('expenses')
          .select('itinerary_id, expense_number, amount, currency, category, status, expense_date, payment_date, booking_supplier_status_id')
      ),
      scoped(
        supabase
          .from('commissions')
          .select('itinerary_id, description, source_name, commission_amount, currency, commission_type, category, status, transaction_date, paid_date, due_date')
      ),
    ])

    if (invoiceResult.error) console.error('Error fetching invoices:', invoiceResult.error)
    if (expenseResult.error) console.error('Error fetching expenses:', expenseResult.error)
    // Commissions are new to this report. A tenant whose commissions table is
    // unreadable still gets a P&L — but it must not silently look complete,
    // so the failure is surfaced on the response.
    if (commissionResult.error) console.error('Error fetching commissions:', commissionResult.error)

    const invoices = (invoiceResult.data || []) as PnlInvoice[]
    const expenses = (expenseResult.data || []) as PnlExpense[]
    const commissions = (commissionResult.data || []) as PnlCommission[]

    // ---------- Exchange rates (shared loader, see lib/fx-report.ts) ----------
    const reportingCurrency = resolveReportingCurrency(
      itineraries as PnlItinerary[],
      requestedCurrency
    )
    const fxContext = await loadFxContext(supabase, {
      currencies: collectCurrencies(
        itineraries as PnlItinerary[], invoices, expenses, commissions
      ),
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

    // ---------- Extras sold after the trips were priced (migration 321) ----------
    // CONFIRMED booking_extras, joined to the trip through bookings.itinerary_id.
    // A database without the table contributes nothing rather than 500ing.
    const extrasByTrip = new Map<string, PnlExtra[]>()
    if (itineraryIds.length) {
      const { data: extraRows, error: extrasError } = await extrasAdmin()
        .from('booking_extras')
        .select('title, quantity, unit_price, currency, supplier_cost, supplier_currency, confirmed_at, bookings!inner(itinerary_id, tenant_id)')
        .eq('status', 'confirmed')
        .in('bookings.itinerary_id', itineraryIds.slice(0, MAX_IN_FILTER_IDS))
      if (extrasError) console.error('profit-loss: could not read booking extras', extrasError)
      for (const row of (extraRows ?? []) as Array<PnlExtra & { bookings: { itinerary_id?: string } | null }>) {
        const itinId = row.bookings?.itinerary_id
        if (!itinId) continue
        const list = extrasByTrip.get(itinId) ?? []
        list.push(row)
        extrasByTrip.set(itinId, list)
      }
    }

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
