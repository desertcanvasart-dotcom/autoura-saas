import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const range = searchParams.get('range') || '30d'

  try {
    // Require authentication
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult

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

    // Fetch all data in parallel
    const [
      itinerariesResult,
      clientsResult,
      leadsResult,
      followUpsResult,
      revenueByWeekResult
    ] = await Promise.all([
      // Itineraries (bookings) in date range
      supabase
        .from('itineraries')
        .select('id, status, total_price, start_date, cities, created_at')
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
        .select('total_price, created_at')
        .in('status', ['confirmed', 'completed'])
        .gte('created_at', startDateStr)
        .order('created_at', { ascending: true })
    ])

    const itineraries = itinerariesResult.data || []
    const clients = clientsResult.data || []
    const leadsCount = leadsResult.count || 0
    const followUpsCount = followUpsResult.count || 0
    const revenueData = revenueByWeekResult.data || []

    // Calculate booking stats
    const bookingStats = {
      total: itineraries.length,
      confirmed: itineraries.filter(i => i.status === 'confirmed').length,
      pending: itineraries.filter(i => i.status === 'pending' || i.status === 'quoted').length,
      cancelled: itineraries.filter(i => i.status === 'cancelled').length,
      completed: itineraries.filter(i => i.status === 'completed').length
    }

    // Calculate revenue
    const confirmedItineraries = itineraries.filter(i => 
      i.status === 'confirmed' || i.status === 'completed'
    )
    const totalRevenue = confirmedItineraries.reduce((sum, i) => 
      sum + (parseFloat(i.total_price) || 0), 0
    )

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
    const weeklyRevenue = groupByWeek(revenueData, range)

    // Calculate destination stats from itineraries
    const destinationMap = new Map<string, { bookings: number; revenue: number }>()
    itineraries.forEach(itinerary => {
      if (itinerary.cities && Array.isArray(itinerary.cities)) {
        itinerary.cities.forEach((city: string) => {
          const existing = destinationMap.get(city) || { bookings: 0, revenue: 0 }
          existing.bookings += 1
          if (itinerary.status === 'confirmed' || itinerary.status === 'completed') {
            existing.revenue += parseFloat(itinerary.total_price) || 0
          }
          destinationMap.set(city, existing)
        })
      }
    })

    const destinations = Array.from(destinationMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 5)

    // Calculate growth (compare to previous period)
    const previousStartDate = new Date(startDate.getTime() - (now.getTime() - startDate.getTime()))
    const { data: previousItineraries } = await supabase
      .from('itineraries')
      .select('total_price, status')
      .gte('created_at', previousStartDate.toISOString())
      .lt('created_at', startDateStr)
      .in('status', ['confirmed', 'completed'])

    const previousRevenue = (previousItineraries || []).reduce((sum, i) => 
      sum + (parseFloat(i.total_price) || 0), 0
    )
    
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

// Helper to group revenue by week
function groupByWeek(data: any[], range: string): { month: string; revenue: number }[] {
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
    const date = new Date(item.created_at)
    const weekStart = getWeekStart(date)
    const weekKey = weekStart.toISOString().split('T')[0]
    
    const existing = weekMap.get(weekKey) || 0
    weekMap.set(weekKey, existing + (parseFloat(item.total_price) || 0))
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
  const ssResidual = dataPoints.reduce((sum, p) => {
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