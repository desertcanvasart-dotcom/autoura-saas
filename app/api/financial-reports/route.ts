// app/api/financial-reports/route.ts
// ============================================
// AUTOURA - FINANCIAL REPORTS API
// ============================================
// Comprehensive financial analytics and reporting
// Multi-tenancy: RLS enforces tenant isolation on ALL queries
// Security: Requires authentication, ALL data filtered by tenant
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'

interface MonthlyData {
  month: string
  year: number
  month_num: number
  revenue: number
  invoiced: number
  collected: number
  expenses: number
  expenses_paid: number
  net_profit: number
  trip_count: number
  invoice_count: number
  expense_count: number
}

interface QuarterlyData {
  quarter: string
  year: number
  revenue: number
  expenses: number
  net_profit: number
  margin: number
}

interface CategoryExpense {
  category: string
  amount: number
  percentage: number
}

interface CommissionData {
  name: string
  type: string
  total_earned: number
  total_paid: number
  total_pending: number
  trip_count: number
  expenses: any[]
}

/**
 * GET /api/financial-reports
 * Comprehensive financial analytics for authenticated user's tenant
 * Query params: type (overview, revenue, cashflow, tax, commission), year, quarter, month
 * RLS policies automatically filter ALL data by tenant_id
 */
export async function GET(request: NextRequest) {
  try {
    // Use authenticated client - RLS automatically filters ALL queries by tenant
    const supabase = await createAuthenticatedClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const reportType = searchParams.get('type') || 'overview' // overview, revenue, cashflow, tax, commission
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())
    const quarter = searchParams.get('quarter') // Q1, Q2, Q3, Q4
    const month = searchParams.get('month') // 1-12

    // Fetch all invoices (RLS filters to tenant's invoices only)
    const { data: invoices, error: invError } = await supabase
      .from('invoices')
      .select('*')
      .order('issue_date', { ascending: true })

    if (invError) {
      console.error('❌ Error fetching invoices:', invError)
    }

    // Fetch all expenses (RLS filters to tenant's expenses only)
    const { data: expenses, error: expError } = await supabase
      .from('expenses')
      .select('*')
      .order('expense_date', { ascending: true })

    if (expError) {
      console.error('❌ Error fetching expenses:', expError)
    }

    // Fetch itineraries for trip count (RLS filters to tenant's itineraries only)
    const { data: itineraries, error: itinError } = await supabase
      .from('itineraries')
      .select('id, start_date, status, total_cost')

    if (itinError) {
      console.error('❌ Error fetching itineraries:', itinError)
    }

    const allInvoices = invoices || []
    const allExpenses = expenses || []
    const allItineraries = itineraries || []

    // Filter by year
    const yearInvoices = allInvoices.filter(inv => {
      const invYear = new Date(inv.issue_date).getFullYear()
      return invYear === year
    })

    const yearExpenses = allExpenses.filter(exp => {
      const expYear = new Date(exp.expense_date).getFullYear()
      return expYear === year
    })

    const yearTrips = allItineraries.filter(itin => {
      const tripYear = new Date(itin.start_date).getFullYear()
      return tripYear === year
    })

    // Generate monthly data
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const monthlyData: MonthlyData[] = monthNames.map((monthName, index) => {
      const monthNum = index + 1

      const monthInvoices = yearInvoices.filter(inv => {
        const invMonth = new Date(inv.issue_date).getMonth() + 1
        return invMonth === monthNum
      })

      const monthExpenses = yearExpenses.filter(exp => {
        const expMonth = new Date(exp.expense_date).getMonth() + 1
        return expMonth === monthNum
      })

      const monthTrips = yearTrips.filter(itin => {
        const tripMonth = new Date(itin.start_date).getMonth() + 1
        return tripMonth === monthNum
      })

      const invoiced = monthInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
      const collected = monthInvoices.reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0)
      const totalExpenses = monthExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0)
      const expensesPaid = monthExpenses
        .filter(exp => exp.status === 'paid')
        .reduce((sum, exp) => sum + Number(exp.amount || 0), 0)

      return {
        month: monthName,
        year,
        month_num: monthNum,
        revenue: invoiced,
        invoiced,
        collected,
        expenses: totalExpenses,
        expenses_paid: expensesPaid,
        net_profit: invoiced - totalExpenses,
        trip_count: monthTrips.length,
        invoice_count: monthInvoices.length,
        expense_count: monthExpenses.length
      }
    })

    // Generate quarterly data
    const quarterlyData: QuarterlyData[] = [
      { quarter: 'Q1', months: [1, 2, 3] },
      { quarter: 'Q2', months: [4, 5, 6] },
      { quarter: 'Q3', months: [7, 8, 9] },
      { quarter: 'Q4', months: [10, 11, 12] }
    ].map(q => {
      const qMonths = monthlyData.filter(m => q.months.includes(m.month_num))
      const revenue = qMonths.reduce((sum, m) => sum + m.revenue, 0)
      const expenses = qMonths.reduce((sum, m) => sum + m.expenses, 0)
      const netProfit = revenue - expenses
      return {
        quarter: q.quarter,
        year,
        revenue,
        expenses,
        net_profit: netProfit,
        margin: revenue > 0 ? (netProfit / revenue) * 100 : 0
      }
    })

    // Cash flow data
    const cashInflows = yearInvoices
      .filter(inv => inv.amount_paid > 0)
      .reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0)

    const cashOutflows = yearExpenses
      .filter(exp => exp.status === 'paid')
      .reduce((sum, exp) => sum + Number(exp.amount || 0), 0)

    const pendingReceivables = yearInvoices
      .reduce((sum, inv) => sum + Number(inv.balance_due || 0), 0)

    const pendingPayables = yearExpenses
      .filter(exp => exp.status !== 'paid' && exp.status !== 'rejected')
      .reduce((sum, exp) => sum + Number(exp.amount || 0), 0)

    const cashFlow = {
      inflows: cashInflows,
      outflows: cashOutflows,
      net_cash_flow: cashInflows - cashOutflows,
      pending_receivables: pendingReceivables,
      pending_payables: pendingPayables,
      projected_cash: (cashInflows - cashOutflows) + pendingReceivables - pendingPayables,
      monthly_cash_flow: monthlyData.map(m => ({
        month: m.month,
        inflow: m.collected,
        outflow: m.expenses_paid,
        net: m.collected - m.expenses_paid
      }))
    }

    // Tax summary (expense categories that might be deductible)
    const taxCategories = ['office', 'software', 'marketing', 'fuel', 'permits', 'toll', 'parking']
    const deductibleExpenses = yearExpenses.filter(exp => taxCategories.includes(exp.category))
    const deductibleTotal = deductibleExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0)

    // Group expenses by category for tax
    const expensesByCategory: Record<string, number> = {}
    yearExpenses.forEach(exp => {
      const cat = exp.category || 'other'
      expensesByCategory[cat] = (expensesByCategory[cat] || 0) + Number(exp.amount || 0)
    })

    const categoryBreakdown: CategoryExpense[] = Object.entries(expensesByCategory)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: yearExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0) > 0
          ? (amount / yearExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)) * 100
          : 0
      }))
      .sort((a, b) => b.amount - a.amount)

    const totalRevenue = yearInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
    const totalExpensesAmount = yearExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0)

    const taxSummary = {
      gross_revenue: totalRevenue,
      total_expenses: totalExpensesAmount,
      deductible_expenses: deductibleTotal,
      taxable_income: totalRevenue - deductibleTotal,
      expense_breakdown: categoryBreakdown,
      // Estimated tax (simplified - would need actual tax rates)
      estimated_vat_collected: totalRevenue * 0.14, // 14% Egypt VAT example
      estimated_vat_paid: totalExpensesAmount * 0.14,
      net_vat: (totalRevenue - totalExpensesAmount) * 0.14
    }

    // Commission reports (for guides, drivers, etc.)
    const commissionCategories = ['guide', 'driver', 'airport_staff', 'hotel_staff', 'ground_handler']
    const commissionExpenses = yearExpenses.filter(exp => commissionCategories.includes(exp.category))

    // Group by supplier name
    const commissionMap = new Map<string, CommissionData>()
    commissionExpenses.forEach(exp => {
      const key = exp.supplier_name || `Unknown ${exp.category}`
      if (!commissionMap.has(key)) {
        commissionMap.set(key, {
          name: key,
          type: exp.category || 'other',
          total_earned: 0,
          total_paid: 0,
          total_pending: 0,
          trip_count: 0,
          expenses: []
        })
      }
      const data = commissionMap.get(key)!
      data.total_earned += Number(exp.amount || 0)
      if (exp.status === 'paid') {
        data.total_paid += Number(exp.amount || 0)
      } else {
        data.total_pending += Number(exp.amount || 0)
      }
      data.trip_count += 1
      data.expenses.push(exp)
    })

    const commissionData = Array.from(commissionMap.values())
      .sort((a, b) => b.total_earned - a.total_earned)

    const commissionSummary = {
      total_commissions: commissionExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0),
      total_paid: commissionExpenses
        .filter(exp => exp.status === 'paid')
        .reduce((sum, exp) => sum + Number(exp.amount || 0), 0),
      total_pending: commissionExpenses
        .filter(exp => exp.status !== 'paid')
        .reduce((sum, exp) => sum + Number(exp.amount || 0), 0),
      by_type: commissionCategories.map(cat => ({
        type: cat,
        amount: commissionExpenses
          .filter(exp => exp.category === cat)
          .reduce((sum, exp) => sum + Number(exp.amount || 0), 0),
        count: commissionExpenses.filter(exp => exp.category === cat).length
      })),
      recipients: commissionData
    }

    // Year-over-year comparison
    const prevYear = year - 1
    const prevYearInvoices = allInvoices.filter(inv => {
      const invYear = new Date(inv.issue_date).getFullYear()
      return invYear === prevYear
    })
    const prevYearExpenses = allExpenses.filter(exp => {
      const expYear = new Date(exp.expense_date).getFullYear()
      return expYear === prevYear
    })

    const prevYearRevenue = prevYearInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
    const prevYearExpenseTotal = prevYearExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0)

    const yearOverYear = {
      current_year: year,
      previous_year: prevYear,
      revenue_change: totalRevenue - prevYearRevenue,
      revenue_change_percent: prevYearRevenue > 0 ? ((totalRevenue - prevYearRevenue) / prevYearRevenue) * 100 : 0,
      expense_change: totalExpensesAmount - prevYearExpenseTotal,
      expense_change_percent: prevYearExpenseTotal > 0 ? ((totalExpensesAmount - prevYearExpenseTotal) / prevYearExpenseTotal) * 100 : 0
    }

    // Overall summary
    const summary = {
      year,
      total_revenue: totalRevenue,
      total_collected: cashInflows,
      total_expenses: totalExpensesAmount,
      total_expenses_paid: cashOutflows,
      gross_profit: totalRevenue - totalExpensesAmount,
      profit_margin: totalRevenue > 0 ? ((totalRevenue - totalExpensesAmount) / totalRevenue) * 100 : 0,
      trip_count: yearTrips.length,
      invoice_count: yearInvoices.length,
      expense_count: yearExpenses.length,
      average_trip_value: yearTrips.length > 0 ? totalRevenue / yearTrips.length : 0,
      collection_rate: totalRevenue > 0 ? (cashInflows / totalRevenue) * 100 : 0
    }

    return NextResponse.json({
      success: true,
      summary,
      monthly: monthlyData,
      quarterly: quarterlyData,
      cashFlow,
      taxSummary,
      commissionSummary,
      yearOverYear,
      availableYears: [...new Set([
        ...allInvoices.map(inv => new Date(inv.issue_date).getFullYear()),
        ...allExpenses.map(exp => new Date(exp.expense_date).getFullYear())
      ])].sort((a, b) => b - a)
    })
  } catch (error) {
    console.error('❌ Error in Financial Reports GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
