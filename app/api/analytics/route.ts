import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import {
  loadFxContext,
  convertMoneyRows,
  resolveReportingCurrency,
  collectCurrencies,
} from '@/lib/fx-report'
import { mergeFxSummary, emptyFxSummary, type FxHole } from '@/lib/fx-conversion'

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

    // Fetch all data in parallel
    const [
      itinerariesResult,
      clientsResult,
      leadsResult,
      followUpsResult,
      revenueByWeekResult,
      previousItinerariesResult
    ] = await Promise.all([
      // Itineraries (bookings) in date range.
      // Columns verified against the live schema — `total_cost`, not
      // `total_price`; `destinations` (TEXT[]), not `cities`.
      supabase
        .from('itineraries')
        .select('id, itinerary_code, status, total_cost, currency, start_date, destinations, created_at')
        .gte('created_at', startDateStr),
      
      // All clients with status
      supabase
        .from('clients')
        .select('id, status, created_at')
        .gte('created_at', startDateStr),
      
      // Leads count (clients with status = 'lead')
      supabase
        .from('clients')
        .select('id', { count: 'exact' })
        .eq('status', 'lead'),
      
      // Follow-ups count
      supabase
        .from('follow_ups')
        .select('id', { count: 'exact' })
        .eq('status', 'pending'),
      
      // Revenue by week for trend chart
      supabase
        .from('itineraries')
        .select('itinerary_code, total_cost, currency, created_at')
        .in('status', REVENUE_STATUSES)
        .gte('created_at', startDateStr)
        .order('created_at', { ascending: true }),

      // Previous period, for growth
      supabase
        .from('itineraries')
        .select('itinerary_code, total_cost, currency, status, created_at')
        .gte('created_at', previousStartDate.toISOString())
        .lt('created_at', startDateStr)
        .in('status', REVENUE_STATUSES)
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

    const rawItineraries = (itinerariesResult.data || []) as AnalyticsItinerary[]
    const clients = clientsResult.data || []
    const leadsCount = leadsResult.count || 0
    const followUpsCount = followUpsResult.count || 0
    const rawRevenueData = (revenueByWeekResult.data || []) as AnalyticsItinerary[]
    const rawPreviousItineraries = (previousItinerariesResult.data || []) as AnalyticsItinerary[]

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
    const bookingStats = {
      total: itineraries.length,
      confirmed: itineraries.filter(i => i.status === 'confirmed').length,
      pending: itineraries.filter(i => i.status === 'pending' || i.status === 'quoted').length,
      cancelled: itineraries.filter(i => i.status === 'cancelled').length,
      completed: itineraries.filter(i => i.status === 'completed').length
    }

    // Calculate revenue
    const confirmedItineraries = convertibleItineraries.filter(i =>
      REVENUE_STATUSES.includes(i.status || '')
    )
    const totalRevenue = confirmedItineraries.reduce((sum, i) => sum + amountOf(i), 0)

    // Calculate client stats
    const totalClients = clients.length
    const newClients = clients.filter(c => c.status === 'lead' || c.status === 'prospect').length
    const returningClients = clients.filter(c => c.status === 'customer').length

    // Calculate conversion rate (confirmed / total inquiries)
    const conversionRate = bookingStats.total > 0
      ? (bookingStats.confirmed / bookingStats.total) * 100
      : 0

    // Calculate average deal size
    const avgDealSize = confirmedItineraries.length > 0
      ? totalRevenue / confirmedItineraries.length
      : 0

    // Group revenue by week for trend chart
    const weeklyRevenue = groupByWeek(convertedRevenue.rows, range)

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

// Helper to group revenue by week.
// Receives rows already restated into the reporting currency, so `total_cost`
// here is a converted number — never a raw foreign amount.
function groupByWeek(
  data: Array<{ total_cost?: number | string | null; created_at?: string | null }>,
  range: string
): { month: string; revenue: number }[] {
  if (data.length === 0) {
    // Return empty weeks based on range
    const weeks = range === '7d' ? 1 : range === '30d' ? 4 : range === '90d' ? 12 : 52
    return Array.from({ length: Math.min(weeks, 5) }, (_, i) => ({
      month: `Week ${i + 1}`,
      revenue: 0
    }))
  }

  const weekMap = new Map<string, number>()
  
  data.forEach(item => {
    if (!item.created_at) return
    const date = new Date(item.created_at)
    const weekStart = getWeekStart(date)
    const weekKey = weekStart.toISOString().split('T')[0]

    const amount = Number(item.total_cost ?? 0)
    const existing = weekMap.get(weekKey) || 0
    weekMap.set(weekKey, existing + (Number.isFinite(amount) ? amount : 0))
  })

  // Convert to array and sort
  const weeks = Array.from(weekMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-5) // Last 5 weeks
    .map((entry, index) => ({
      month: `Week ${index + 1}`,
      revenue: entry[1]
    }))

  // Ensure at least some data points
  if (weeks.length === 0) {
    return [{ month: 'Week 1', revenue: 0 }]
  }

  return weeks
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
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