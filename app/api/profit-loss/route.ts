import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { buildPnlSummary, type PnlItinerary } from '@/lib/trip-pnl'
import { loadTripPnls, PnlLoadError } from '@/lib/trip-pnl-load'
import { fetchAllPages } from '@/lib/db/fetch-all-pages'

// ============================================
// GET /api/profit-loss
// ============================================
// Per-trip profit and loss.
//
// The arithmetic lives in lib/trip-pnl.ts (pure, unit-tested); the rows are
// gathered by lib/trip-pnl-load.ts (shared with the itineraries list's
// needs-attention count). This route picks the trips and summarises. Two
// things the loader fetches that the earlier version did not:
//
//   - commissions, because a trip that pays an agent 15% has 15% less margin
//   - exchange_rate_snapshots, so a cost paid in EGP against a EUR trip is
//     converted at the rate on the day it was paid
//
// Costs that cannot be converted are excluded and reported as holes rather
// than summed at face value; see lib/trip-pnl.ts for the policy.

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

    // Margins, costs and commissions are for managers and admins — the page
    // was, but this route answered any signed-in role.
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied

    const { supabase, tenant_id } = authResult

    const searchParams = request.nextUrl.searchParams
    const itineraryId = searchParams.get('itineraryId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const status = searchParams.get('status')
    // resolveReportingCurrency normalises this. Unasked, the agency's own
    // currency — it was the most common trip currency, which could change
    // from one filter to the next.
    let requestedCurrency = searchParams.get('reportingCurrency')
    if (!requestedCurrency) {
      const { data: tenant } = await supabase.from('tenants').select('default_currency').eq('id', tenant_id).maybeSingle()
      requestedCurrency = (tenant as { default_currency?: string | null } | null)?.default_currency ?? null
    }

    // ---------- Itineraries (RLS filters by tenant) ----------
    // Every trip, a page at a time (one read stopped at 1000). A trip is in
    // the range when it overlaps it — starts before the end and ends after
    // the start — not only when it starts inside it.
    const { data: itineraries, error: itinError } = await fetchAllPages<PnlItinerary>((from, to) => {
      let q = supabase
        .from('itineraries')
        .select('id, tenant_id, itinerary_code, trip_name, client_name, start_date, end_date, status, currency, total_cost')
        .order('start_date', { ascending: false })
        .order('id', { ascending: true })
      if (itineraryId) q = q.eq('id', itineraryId)
      if (status) q = q.eq('status', status)
      if (startDate) q = q.or(`end_date.gte.${startDate},and(end_date.is.null,start_date.gte.${startDate})`)
      if (endDate) q = q.lte('start_date', endDate)
      return q.range(from, to)
    })

    if (itinError) {
      console.error('Error fetching itineraries:', itinError)
      return NextResponse.json({ success: false, error: 'Failed to fetch itineraries' }, { status: 500 })
    }

    if (itineraries.length === 0) {
      // The same shape as any other answer: a bare [] left the page showing
      // the previous filter's trips and totals.
      const summary = buildPnlSummary({ trips: [], reportingCurrency: requestedCurrency || 'EUR', fxIndex: new Map() })
      return NextResponse.json({ success: true, data: [], summary, meta: { reporting_currency: summary.reporting_currency, fx_history_available: true, snapshot_count: 0, commissions_available: true } })
    }

    const { pnlData, reportingCurrency, fxContext, commissionsAvailable } =
      await loadTripPnls(supabase, itineraries as PnlItinerary[], requestedCurrency)
    const { fxIndex, liveRate } = fxContext

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
        commissions_available: commissionsAvailable,
      },
    })
  } catch (error) {
    console.error('Error in P&L GET:', error)
    if (error instanceof PnlLoadError) {
      return NextResponse.json({ success: false, error: `${error.message} — the report would be wrong, so it is not shown.` }, { status: 500 })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
