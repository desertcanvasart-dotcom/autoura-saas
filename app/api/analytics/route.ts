import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import {
  loadFxContext,
  convertMoneyRows,
  resolveReportingCurrency,
  collectCurrencies,
} from '@/lib/fx-report'
import { mergeFxSummary, emptyFxSummary, type FxHole } from '@/lib/fx-conversion'
import { fetchAllPages } from '@/lib/db/fetch-all-pages'
import { effectiveItineraryTotal, type PricedService } from '@/lib/itinerary-client-total'

// ============================================
// GET /api/analytics
// ============================================
// Two defects fixed here, both of which made every revenue figure wrong:
//
//   1. The itinerary query selected `total_price` and `cities`. NEITHER
//      COLUMN EXISTS (the columns are `total_cost` and `destinations`), so
//      PostgREST rejected the whole query with 42703, `.data` came back null,
//      and every downstream number — revenue, growth, forecast, average deal
//      size, destination breakdown — silently computed to zero. Verified
//      against the live schema on 2026-07-26.
//
//   2. Revenue was summed straight across currencies, so an EGP trip added
//      its face value to a EUR total.
//
// Money is now restated into one reporting currency at each trip's own date;
// anything that cannot be converted is excluded and reported rather than
// added at face value.

/** Trip statuses that count as booked revenue. */
const REVENUE_STATUSES = ['confirmed', 'completed']

/** Quoted and waiting on the client. A sent quote is saved as 'sent'; the
 *  older 'pending' / 'quoted' are kept so existing rows still count. */
const PENDING_STATUSES = ['sent', 'pending', 'quoted']

type DbError = { message?: string } | null

interface AnalyticsItinerary {
  id?: string
  status?: string | null
  total_cost?: number | string | null
  currency?: string | null
  start_date?: string | null
  destinations?: string[] | null
  created_at?: string | null
  itinerary_code?: string | null
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const range = searchParams.get('range') || '30d'
  const requestedCurrency = searchParams.get('reportingCurrency')

  try {
    // Require authentication
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

    // Calculate date range
    const now = new Date()
    let startDate: Date

    switch (range) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    }

    const startDateStr = startDate.toISOString()

    // Previous equal-length window, for the growth comparison.
    const previousStartDate = new Date(startDate.getTime() - (now.getTime() - startDate.getTime()))

    const ITINERARY_COLS = 'id, itinerary_code, status, total_cost, currency, start_date, destinations, created_at'

    // Every read is paged: past 1,000 rows ("Last Year" for a busy agency)
    // PostgREST cut them short and revenue, bookings and growth read low.
    const [
      itinerariesResult,
      clientsResult,
      leadsResult,
      followUpsResult,
      previousItinerariesResult
    ] = await Promise.all([
      // Itineraries (bookings) in date range.
      fetchAllPages<AnalyticsItinerary, DbError>((from, to) =>
        supabase
          .from('itineraries')
          .select(ITINERARY_COLS)
          .gte('created_at', startDateStr)
          .order('created_at', { ascending: true })
          .order('id')
          .range(from, to)),

      // Clients added in the range
      fetchAllPages<{ id: string; status: string | null; created_at: string | null }, DbError>((from, to) =>
        supabase
          .from('clients')
          .select('id, status, created_at')
          .gte('created_at', startDateStr)
          .order('id')
          .range(from, to)),

      // Leads count (clients with status = 'lead'), all time
      supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'lead'),

      // Open follow-ups — the table the Follow-ups page uses (this read
      // 'follow_ups', which the page never writes).
      supabase
        .from('client_followups')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'overdue']),

      // Previous period, for growth
      fetchAllPages<AnalyticsItinerary, DbError>((from, to) =>
        supabase
          .from('itineraries')
          .select(ITINERARY_COLS)
          .gte('created_at', previousStartDate.toISOString())
          .lt('created_at', startDateStr)
          .in('status', REVENUE_STATUSES)
          .order('id')
          .range(from, to)),
    ])

    // A failed itinerary query used to be indistinguishable from "no trips".
    // Surface it instead of reporting zeros as though they were real.
    if (itinerariesResult.error) {
      console.error('Analytics: itineraries query failed:', itinerariesResult.error)
      return NextResponse.json(
        { success: false, error: 'Failed to load bookings data' },
        { status: 500 }
      )
    }
    // The other figures: say which could not be read rather than show 0.
    const degraded: string[] = []
    if (clientsResult.error) degraded.push('clients')
    if (leadsResult.error) degraded.push('leads')
    if (followUpsResult.error) degraded.push('follow-ups')
    if (previousItinerariesResult.error) degraded.push('growth')

    // A trip's amount is what its page shows: the services' client total when
    // it has priced services, else the stored total_cost — a cache that can be
    // 0 or stale, which made priced trips add nothing to revenue.
    const withEffectiveTotals = async (rows: AnalyticsItinerary[]): Promise<AnalyticsItinerary[]> => {
      const ids = rows.map(r => r.id).filter((id): id is string => !!id)
      const servicesBy = new Map<string, PricedService[]>()
      for (let i = 0; i < ids.length; i += 200) {
        const { data: svc, error } = await fetchAllPages<PricedService & { itinerary_id: string | null }, DbError>((from, to) =>
          supabase
            .from('itinerary_services')
            .select('id, itinerary_id, total_cost, client_price')
            .in('itinerary_id', ids.slice(i, i + 200))
            .order('id')
            .range(from, to))
        if (error) {
          if (!degraded.includes('trip totals')) degraded.push('trip totals')
          continue
        }
        for (const row of svc) {
          if (!row.itinerary_id) continue
          const bucket = servicesBy.get(row.itinerary_id) ?? []
          bucket.push(row)
          servicesBy.set(row.itinerary_id, bucket)
        }
      }
      return rows.map(r => ({ ...r, total_cost: effectiveItineraryTotal(r as Parameters<typeof effectiveItineraryTotal>[0], servicesBy.get(r.id ?? '') ?? []) }))
    }

    const rawItineraries = await withEffectiveTotals(itinerariesResult.data)
    const clients = clientsResult.data
    // A failed count is 0 here and named in `degraded`, which the page shows.
    const leadsCount = leadsResult.count ?? 0
    const followUpsCount = followUpsResult.count ?? 0
    // Booked trips of the range, for the weekly trend.
    const rawRevenueData = rawItineraries.filter(i => REVENUE_STATUSES.includes(i.status || ''))
    const rawPreviousItineraries = await withEffectiveTotals(previousItinerariesResult.data)

    // ---------- Restate every amount into one currency ----------
    // Trips are converted at their own creation date, which is the date the
    // rest of this report buckets them by.
    const reportingCurrency = resolveReportingCurrency(rawItineraries, requestedCurrency)
    const fxContext = await loadFxContext(supabase, {
      currencies: collectCurrencies(rawItineraries, rawRevenueData, rawPreviousItineraries),
      reportingCurrency,
    })

    const convertSpec = {
      currency: (row: AnalyticsItinerary) => row.currency,
      date: (row: AnalyticsItinerary) => row.created_at,
      fields: ['total_cost'],
      kind: 'revenue' as FxHole['kind'],
      reference: (row: AnalyticsItinerary) => row.itinerary_code || 'trip',
    }

    const convertedCurrent = convertMoneyRows(fxContext, rawItineraries, convertSpec)
    const convertedRevenue = convertMoneyRows(fxContext, rawRevenueData, convertSpec)
    const convertedPrevious = convertMoneyRows(fxContext, rawPreviousItineraries, convertSpec)

    const fx = emptyFxSummary()
    mergeFxSummary(fx, convertedCurrent.fx)
    mergeFxSummary(fx, convertedRevenue.fx)
    mergeFxSummary(fx, convertedPrevious.fx)
    const holes: FxHole[] = [
      ...convertedCurrent.holes,
      ...convertedRevenue.holes,
      ...convertedPrevious.holes,
    ]

    // Counts (bookings, conversion rate) use every trip, including any whose
    // amount could not be converted — a trip still happened even if its money
    // could not be restated.
    const itineraries = rawItineraries
    // Money totals use only the rows that converted.
    const convertibleItineraries = convertedCurrent.rows

    const amountOf = (row: AnalyticsItinerary): number => {
      const value = Number(row.total_cost ?? 0)
      return Number.isFinite(value) ? value : 0
    }

    // Calculate booking stats
    // GET-H02: "Total Bookings" counted EVERY itinerary, drafts included, so
    // the card said 1 while its own breakdown said 0 confirmed + 0 pending
    // and the Bookings module said 0. A draft is not a booking: total is now
    // the sum of the real booking states, so the card always equals its
    // breakdown.
    const bookingCounts = {
      confirmed: itineraries.filter(i => i.status === 'confirmed').length,
      pending: itineraries.filter(i => PENDING_STATUSES.includes(i.status || '')).length,
      cancelled: itineraries.filter(i => i.status === 'cancelled').length,
      completed: itineraries.filter(i => i.status === 'completed').length
    }
    const bookingStats = {
      total: bookingCounts.confirmed + bookingCounts.pending + bookingCounts.cancelled + bookingCounts.completed,
      ...bookingCounts
    }

    // Calculate revenue
    const confirmedItineraries = convertibleItineraries.filter(i =>
      REVENUE_STATUSES.includes(i.status || '')
    )
    const totalRevenue = confirmedItineraries.reduce((sum, i) => sum + amountOf(i), 0)

    // Client stats — clients ADDED in the range, split by their status.
    const totalClients = clients.length
    const newClients = clients.filter(c => c.status === 'lead').length
    const returningClients = clients.filter(c => c.status === 'customer').length

    // Conversion: trips that became bookings (confirmed, or since run and
    // completed — leaving those out made conversion fall as trips finished)
    // over every trip started, drafts included.
    const conversionRate = itineraries.length > 0
      ? ((bookingStats.confirmed + bookingStats.completed) / itineraries.length) * 100
      : 0

    // Calculate average deal size
    const avgDealSize = confirmedItineraries.length > 0
      ? totalRevenue / confirmedItineraries.length
      : 0

    // Group revenue by week for trend chart
    const weeklyRevenue = groupByWeek(convertedRevenue.rows, startDate, now)

    // Calculate destination stats from itineraries.
    // `destinations` is TEXT[] on itineraries; revenue per destination uses
    // the converted rows only.
    const convertedById = new Map(
      convertibleItineraries.map(row => [row.id, row])
    )
    const destinationMap = new Map<string, { bookings: number; revenue: number }>()
    itineraries.forEach(itinerary => {
      if (!Array.isArray(itinerary.destinations)) return
      itinerary.destinations.forEach((city: string) => {
        if (!city) return
        const existing = destinationMap.get(city) || { bookings: 0, revenue: 0 }
        existing.bookings += 1
        if (REVENUE_STATUSES.includes(itinerary.status || '')) {
          const converted = convertedById.get(itinerary.id)
          if (converted) existing.revenue += amountOf(converted)
        }
        destinationMap.set(city, existing)
      })
    })

    const destinations = Array.from(destinationMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 5)

    // Calculate growth (compare to previous period)
    const previousRevenue = convertedPrevious.rows.reduce((sum, i) => sum + amountOf(i), 0)

    const revenueGrowth = previousRevenue > 0
      ? ((totalRevenue - previousRevenue) / previousRevenue) * 100
      : totalRevenue > 0 ? 100 : 0

    // Calculate revenue forecast
    const forecast = calculateRevenueForecast(weeklyRevenue, range)

    // Build response
    const analyticsData = {
      revenue: {
        total: totalRevenue,
        growth: revenueGrowth,
        monthlyData: weeklyRevenue,
        forecast: forecast.predictions,
        forecastSummary: {
          nextPeriod: forecast.nextPeriodRevenue,
          confidence: forecast.confidence,
          trend: forecast.trend
        }
      },
      bookings: bookingStats,
      clients: {
        total: totalClients,
        new: newClients,
        returning: returningClients
      },
      destinations,
      conversionRate,
      avgDealSize,
      // Pipeline specific data
      pipeline: {
        leads: leadsCount,
        followups: followUpsCount,
        pending: bookingStats.pending,
        cancelled: bookingStats.cancelled,
        confirmed: bookingStats.confirmed,
        completed: bookingStats.completed
      },
      // Figures that could not be read (shown as unavailable, not 0).
      degraded,
      // What currency the money above is in, and how exact it is.
      currency: {
        reporting_currency: reportingCurrency,
        fx,
        complete: holes.length === 0,
        excluded_trips: holes.length,
        holes,
        fx_history_available: fxContext.historyAvailable,
      }
    }

    return NextResponse.json({ success: true, data: analyticsData })
  } catch (error: any) {
    console.error('Analytics error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// Revenue per week across the WHOLE range: every Monday-to-Sunday week from
// the range's start to today, a week with no bookings included as 0. It kept
// only the last 5 weeks that had revenue and renumbered them, so on 90 days
// or a year the trend and the forecast covered about five weeks, and empty
// weeks vanished instead of pulling the line down. Weeks are UTC.
// Receives rows already restated into the reporting currency.
function groupByWeek(
  data: Array<{ total_cost?: number | string | null; created_at?: string | null }>,
  start: Date,
  end: Date
): { month: string; revenue: number }[] {
  const weekMap = new Map<string, number>()
  for (let w = getWeekStart(start); w.getTime() <= end.getTime(); w = new Date(w.getTime() + 7 * 864e5)) {
    weekMap.set(w.toISOString().slice(0, 10), 0)
  }
  for (const item of data) {
    if (!item.created_at) continue
    const key = getWeekStart(new Date(item.created_at)).toISOString().slice(0, 10)
    if (!weekMap.has(key)) continue
    const amount = Number(item.total_cost ?? 0)
    weekMap.set(key, (weekMap.get(key) ?? 0) + (Number.isFinite(amount) ? amount : 0))
  }
  return Array.from(weekMap.entries())
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([key, revenue]) => ({
      month: new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      revenue: Math.round(revenue * 100) / 100,
    }))
}

/** Monday 00:00 UTC of the date's week. */
function getWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1))
  return d
}

// Revenue forecasting using linear regression
function calculateRevenueForecast(
  historicalData: { month: string; revenue: number }[],
  range: string
): {
  predictions: { month: string; revenue: number; isForecasted: boolean; confidenceLow: number; confidenceHigh: number }[],
  nextPeriodRevenue: number,
  confidence: number,
  trend: 'up' | 'down' | 'stable'
} {
  // Need at least 2 data points for forecasting
  if (historicalData.length < 2) {
    return {
      predictions: historicalData.map(d => ({
        ...d,
        isForecasted: false,
        confidenceLow: d.revenue,
        confidenceHigh: d.revenue
      })),
      nextPeriodRevenue: 0,
      confidence: 0,
      trend: 'stable'
    }
  }

  // Prepare data for linear regression
  const dataPoints = historicalData.map((d, index) => ({
    x: index,
    y: d.revenue
  }))

  // Calculate linear regression (y = mx + b)
  const n = dataPoints.length
  const sumX = dataPoints.reduce((sum, p) => sum + p.x, 0)
  const sumY = dataPoints.reduce((sum, p) => sum + p.y, 0)
  const sumXY = dataPoints.reduce((sum, p) => sum + p.x * p.y, 0)
  const sumX2 = dataPoints.reduce((sum, p) => sum + p.x * p.x, 0)

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  // Calculate R-squared for confidence
  const yMean = sumY / n
  const ssTotal = dataPoints.reduce((sum, p) => sum + Math.pow(p.y - yMean, 2), 0)
  const ssResidual = dataPoints.reduce((sum: number, p: any) => {
    const predicted = slope * p.x + intercept
    return sum + Math.pow(p.y - predicted, 2)
  }, 0)
  const rSquared = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0
  const confidence = Math.max(0, Math.min(100, rSquared * 100))

  // Calculate standard error for confidence intervals
  const standardError = Math.sqrt(ssResidual / (n - 2))

  // Determine trend
  let trend: 'up' | 'down' | 'stable' = 'stable'
  if (slope > yMean * 0.05) trend = 'up' // More than 5% growth
  else if (slope < -yMean * 0.05) trend = 'down' // More than 5% decline

  // Generate forecast periods (3 periods ahead)
  const forecastPeriods = range === '7d' ? 3 : range === '30d' ? 4 : 3
  const predictions: {
    month: string;
    revenue: number;
    isForecasted: boolean;
    confidenceLow: number;
    confidenceHigh: number;
  }[] = []

  // Add historical data with confidence intervals
  historicalData.forEach((d, index) => {
    const predicted = slope * index + intercept
    const margin = 1.96 * standardError // 95% confidence interval
    predictions.push({
      ...d,
      isForecasted: false,
      confidenceLow: Math.max(0, predicted - margin),
      confidenceHigh: predicted + margin
    })
  })

  // Add forecasted periods
  for (let i = 1; i <= forecastPeriods; i++) {
    const x = n + i - 1
    const forecastedRevenue = slope * x + intercept
    const margin = 1.96 * standardError * Math.sqrt(1 + 1/n + Math.pow(x - sumX/n, 2) / sumX2)

    predictions.push({
      month: `Forecast ${i}`,
      revenue: Math.max(0, forecastedRevenue),
      isForecasted: true,
      confidenceLow: Math.max(0, forecastedRevenue - margin),
      confidenceHigh: forecastedRevenue + margin
    })
  }

  // Calculate next period revenue (first forecast)
  const nextPeriodRevenue = Math.max(0, slope * n + intercept)

  return {
    predictions,
    nextPeriodRevenue,
    confidence: Math.round(confidence),
    trend
  }
}