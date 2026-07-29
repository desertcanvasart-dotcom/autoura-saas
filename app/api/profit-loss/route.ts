import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { loadFxContext, collectCurrencies, resolveReportingCurrency } from '@/lib/fx-report'
import {
  computeTripPnL,
  buildPnlSummary,
  type PnlCommission,
  type PnlExpense,
  type PnlInvoice,
  type PnlItinerary,
  type TripPnL,
} from '@/lib/trip-pnl'

// ============================================
// GET /api/profit-loss
// ============================================
// Per-trip profit and loss.
//
// The arithmetic lives in lib/trip-pnl.ts (pure, unit-tested). This route
// only gathers rows and hands them over. Two things it must fetch that the
// earlier version did not:
//
//   - commissions, because a trip that pays an agent 15% has 15% less margin
//   - exchange_rate_snapshots, so a cost paid in EGP against a EUR trip is
//     converted at the rate on the day it was paid
//
// Costs that cannot be converted are excluded and reported as holes rather
// than summed at face value; see lib/trip-pnl.ts for the policy.

/**
 * Above this many itinerary ids, an `.in()` filter makes the query string
 * long enough to risk a PostgREST/proxy URL limit. Past it we fetch
 * tenant-wide (RLS-scoped) and group in memory.
 */
const MAX_IN_FILTER_IDS = 300

export async function GET(request: NextRequest) {
  try {
    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const itineraryId = searchParams.get('itineraryId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const status = searchParams.get('status')
    // resolveReportingCurrency normalises this; empty means "infer it".
    const requestedCurrency = searchParams.get('reportingCurrency')

    // ---------- Itineraries (RLS filters by tenant) ----------
    let itineraryQuery = supabase
      .from('itineraries')
      .select('id, itinerary_code, trip_name, client_name, start_date, end_date, status, currency, total_cost')
      .order('start_date', { ascending: false })

    if (itineraryId) itineraryQuery = itineraryQuery.eq('id', itineraryId)
    if (status) itineraryQuery = itineraryQuery.eq('status', status)
    if (startDate) itineraryQuery = itineraryQuery.gte('start_date', startDate)
    if (endDate) itineraryQuery = itineraryQuery.lte('start_date', endDate)

    const { data: itineraries, error: itinError } = await itineraryQuery

    if (itinError) {
      console.error('Error fetching itineraries:', itinError)
      return NextResponse.json({ error: 'Failed to fetch itineraries' }, { status: 500 })
    }

    if (!itineraries || itineraries.length === 0) {
      return NextResponse.json([])
    }

    const itineraryIds = (itineraries as PnlItinerary[]).map(i => i.id)

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
          .select('itinerary_id, expense_number, amount, currency, category, status, expense_date, payment_date')
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

    // ---------- Compute ----------
    const pnlData: TripPnL[] = (itineraries as PnlItinerary[]).map(itinerary =>
      computeTripPnL({
        itinerary,
        invoices: invoicesByTrip.get(itinerary.id) || [],
        expenses: expensesByTrip.get(itinerary.id) || [],
        commissions: commissionsByTrip.get(itinerary.id) || [],
        fxIndex,
        liveRate,
      })
    )

    const summary = buildPnlSummary({
      trips: pnlData,
      reportingCurrency,
      fxIndex,
      liveRate,
    })

    return NextResponse.json({
      success: true,
      data: pnlData,
      summary,
      meta: {
        reporting_currency: reportingCurrency,
        /** False when no snapshot history exists yet and everything used live rates. */
        fx_history_available: fxContext.historyAvailable,
        snapshot_count: fxContext.snapshotCount,
        commissions_available: !commissionResult.error,
      },
    })
  } catch (error) {
    console.error('Error in P&L GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
