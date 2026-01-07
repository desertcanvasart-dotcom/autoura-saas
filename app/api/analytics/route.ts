import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '30d'

    const supabase = createClient()

    // Calculate date range
    const now = new Date()
    let startDate = new Date()
    
    switch (range) {
      case '7d':
        startDate.setDate(now.getDate() - 7)
        break
      case '30d':
        startDate.setDate(now.getDate() - 30)
        break
      case '90d':
        startDate.setDate(now.getDate() - 90)
        break
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1)
        break
    }

    // Fetch itineraries
    const { data: itineraries } = await supabase
      .from('itineraries')
      .select('*')
      .gte('created_at', startDate.toISOString())

    // Fetch clients
    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .gte('created_at', startDate.toISOString())

    // Calculate metrics
    const totalRevenue = itineraries?.reduce((sum: number, it: any) => sum + (it.total_cost || 0), 0) || 0    
    const bookingsByStatus = {
      total: itineraries?.length || 0,
      confirmed: itineraries?.filter((it: any) => it.status === 'confirmed').length || 0,
      pending: itineraries?.filter((it: any) => it.status === 'sent' || it.status === 'draft').length || 0,
      cancelled: itineraries?.filter((it: any) => it.status === 'cancelled').length || 0
    }

    // Monthly revenue
    const monthlyRevenue: Record<string, number> = {}
    itineraries?.forEach((it: any) => {
      const month = new Date(it.created_at).toLocaleDateString('en-US', { month: 'short' })
      if (!monthlyRevenue[month]) monthlyRevenue[month] = 0
      monthlyRevenue[month] += it.total_cost || 0
    })

    const monthlyData = Object.entries(monthlyRevenue).map(([month, revenue]) => ({
      month,
      revenue
    }))

    // Calculate new clients (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(now.getDate() - 30)
    const newClients = clients?.filter((c: any) => new Date(c.created_at) > thirtyDaysAgo).length || 0

    const analytics = {
      revenue: {
        total: totalRevenue,
        growth: 23.5, // TODO: Calculate by comparing to previous period
        monthlyData
      },
      bookings: bookingsByStatus,
      clients: {
        total: clients?.length || 0,
        new: newClients,
        returning: (clients?.length || 0) - newClients
      },
      destinations: [], // Can add destination aggregation if needed
      conversionRate: bookingsByStatus.total > 0 
        ? (bookingsByStatus.confirmed / bookingsByStatus.total * 100) 
        : 0,
      avgDealSize: bookingsByStatus.total > 0 
        ? totalRevenue / bookingsByStatus.total 
        : 0
    }

    return NextResponse.json({
      success: true,
      data: analytics
    })

  } catch (error: any) {
    console.error('Analytics API Error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}