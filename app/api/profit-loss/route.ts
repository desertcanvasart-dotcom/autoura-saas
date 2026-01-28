import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

interface TripPnL {
  itinerary_id: string
  itinerary_code: string
  trip_name: string
  client_name: string
  start_date: string
  end_date: string
  status: string
  currency: string
  quoted_amount: number
  total_revenue: number
  total_paid: number
  total_expenses: number
  expenses_paid: number
  expenses_pending: number
  gross_profit: number
  profit_margin: number
  expense_breakdown: Record<string, number>
  invoice_count: number
  expense_count: number
}

export async function GET(request: NextRequest) {
  try {
    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error) {
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

    // Fetch itineraries (RLS automatically filters by tenant_id)
    let itineraryQuery = supabase
      .from('itineraries')
      .select('id, itinerary_code, trip_name, client_name, start_date, end_date, status, currency, total_cost')
      .order('start_date', { ascending: false })

    if (itineraryId) {
      itineraryQuery = itineraryQuery.eq('id', itineraryId)
    }

    if (status) {
      itineraryQuery = itineraryQuery.eq('status', status)
    }

    if (startDate) {
      itineraryQuery = itineraryQuery.gte('start_date', startDate)
    }

    if (endDate) {
      itineraryQuery = itineraryQuery.lte('start_date', endDate)
    }

    const { data: itineraries, error: itinError } = await itineraryQuery

    if (itinError) {
      console.error('Error fetching itineraries:', itinError)
      return NextResponse.json({ error: 'Failed to fetch itineraries' }, { status: 500 })
    }

    if (!itineraries || itineraries.length === 0) {
      return NextResponse.json([])
    }

    // Fetch all invoices (RLS automatically filters by tenant_id)
    const { data: invoices, error: invError } = await supabase
      .from('invoices')
      .select('itinerary_id, total_amount, amount_paid, status')

    if (invError) {
      console.error('Error fetching invoices:', invError)
    }

    // Fetch all expenses (RLS automatically filters by tenant_id)
    const { data: expenses, error: expError } = await supabase
      .from('expenses')
      .select('itinerary_id, amount, category, status')

    if (expError) {
      console.error('Error fetching expenses:', expError)
    }

    // Build P&L for each itinerary
    const pnlData: TripPnL[] = itineraries.map(itinerary => {
      // Get invoices for this itinerary
      const itinInvoices = (invoices || []).filter(inv => inv.itinerary_id === itinerary.id)
      const totalRevenue = itinInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
      const totalPaid = itinInvoices.reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0)

      // Get expenses for this itinerary
      const itinExpenses = (expenses || []).filter(exp => exp.itinerary_id === itinerary.id)
      const totalExpenses = itinExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0)
      const expensesPaid = itinExpenses
        .filter(exp => exp.status === 'paid')
        .reduce((sum, exp) => sum + Number(exp.amount || 0), 0)
      const expensesPending = itinExpenses
        .filter(exp => exp.status !== 'paid' && exp.status !== 'rejected')
        .reduce((sum, exp) => sum + Number(exp.amount || 0), 0)

      // Calculate expense breakdown by category
      const expenseBreakdown: Record<string, number> = {}
      itinExpenses.forEach(exp => {
        const cat = exp.category || 'other'
        expenseBreakdown[cat] = (expenseBreakdown[cat] || 0) + Number(exp.amount || 0)
      })

      // Calculate profit
      // Use totalRevenue if invoices exist, otherwise use quoted amount
      const revenueForCalc = totalRevenue > 0 ? totalRevenue : Number(itinerary.total_cost || 0)
      const grossProfit = revenueForCalc - totalExpenses
      const profitMargin = revenueForCalc > 0 ? (grossProfit / revenueForCalc) * 100 : 0

      return {
        itinerary_id: itinerary.id,
        itinerary_code: itinerary.itinerary_code,
        trip_name: itinerary.trip_name,
        client_name: itinerary.client_name,
        start_date: itinerary.start_date,
        end_date: itinerary.end_date,
        status: itinerary.status,
        currency: itinerary.currency || 'EUR',
        quoted_amount: Number(itinerary.total_cost || 0),
        total_revenue: totalRevenue,
        total_paid: totalPaid,
        total_expenses: totalExpenses,
        expenses_paid: expensesPaid,
        expenses_pending: expensesPending,
        gross_profit: grossProfit,
        profit_margin: profitMargin,
        expense_breakdown: expenseBreakdown,
        invoice_count: itinInvoices.length,
        expense_count: itinExpenses.length
      }
    })

    // Calculate summary stats
    const summary = {
      total_trips: pnlData.length,
      total_revenue: pnlData.reduce((sum, p) => sum + (p.total_revenue || p.quoted_amount), 0),
      total_expenses: pnlData.reduce((sum, p) => sum + p.total_expenses, 0),
      total_profit: pnlData.reduce((sum, p) => sum + p.gross_profit, 0),
      average_margin: pnlData.length > 0 
        ? pnlData.reduce((sum, p) => sum + p.profit_margin, 0) / pnlData.length 
        : 0,
      profitable_trips: pnlData.filter(p => p.gross_profit > 0).length,
      loss_trips: pnlData.filter(p => p.gross_profit < 0).length
    }

    return NextResponse.json({
      success: true,
      data: pnlData,
      summary
    })
  } catch (error) {
    console.error('Error in P&L GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}