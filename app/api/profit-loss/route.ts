import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { buildPnlSummary, type PnlItinerary } from '@/lib/trip-pnl'
import { loadTripPnls } from '@/lib/trip-pnl-load'

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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
