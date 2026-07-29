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
import {
  loadFxContext,
  convertMoneyRows,
  resolveReportingCurrency,
  collectCurrencies,
} from '@/lib/fx-report'
import { mergeFxSummary, emptyFxSummary, type FxHole } from '@/lib/fx-conversion'

// ============================================
// CURRENCY POLICY (added 2026-07-26)
// ============================================
// Every figure in this report used to be a raw sum across whatever currencies
// the underlying rows happened to be in — a EUR invoice and an EGP invoice
// added together and printed as one number. This report now restates all
// money into a single reporting currency first, converting each row at the
// rate on its own date (lib/fx-report.ts). Rows that cannot be converted are
// excluded and listed, never added at face value.
//
// Also corrected here, for consistency with the per-trip P&L:
//   - cancelled invoices no longer count as revenue
//   - rejected expenses no longer count as costs
// Both previously inflated the figures they appeared in.

/** Invoices in this state are not revenue. */
const EXCLUDED_INVOICE_STATUSES = new Set(['cancelled'])
/** A rejected expense is not a cost. */
const EXCLUDED_EXPENSE_STATUSES = new Set(['rejected'])

interface ReportInvoice {
  id?: string
  invoice_number?: string | null
  issue_date?: string | null
  paid_at?: string | null
  total_amount?: number | string | null
  amount_paid?: number | string | null
  balance_due?: number | string | null
  currency?: string | null
  status?: string | null
}

interface ReportExpense {
  id?: string
  expense_number?: string | null
  expense_date?: string | null
  payment_date?: string | null
  amount?: number | string | null
  currency?: string | null
  status?: string | null
  category?: string | null
  supplier_name?: string | null
}

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

    // Date boundaries for efficient database filtering
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`
    const prevYear = year - 1
    const prevYearStart = `${prevYear}-01-01`
    const prevYearEnd = `${prevYear}-12-31`

    // Run all queries in parallel with date filtering at database level
    const [
      yearInvoicesResult,
      yearExpensesResult,
      yearTripsResult,
      prevYearInvoicesResult,
      prevYearExpensesResult,
      availableYearsResult
    ] = await Promise.all([
      // Current year invoices - only needed columns
      supabase
        .from('invoices')
        .select('id, invoice_number, issue_date, paid_at, total_amount, amount_paid, balance_due, currency, status')
        .gte('issue_date', yearStart)
        .lte('issue_date', yearEnd)
        .order('issue_date', { ascending: true }),

      // Current year expenses - only needed columns
      supabase
        .from('expenses')
        .select('id, expense_number, expense_date, payment_date, amount, currency, status, category, supplier_name')
        .gte('expense_date', yearStart)
        .lte('expense_date', yearEnd)
        .order('expense_date', { ascending: true }),

      // Current year itineraries - only needed columns
      supabase
        .from('itineraries')
        .select('id, start_date, status')
        .gte('start_date', yearStart)
        .lte('start_date', yearEnd),

      // Previous year invoices for YoY comparison
      supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, amount_paid, balance_due, currency, status, issue_date, paid_at')
        .gte('issue_date', prevYearStart)
        .lte('issue_date', prevYearEnd),

      // Previous year expenses for YoY comparison
      supabase
        .from('expenses')
        .select('id, expense_number, amount, currency, status, expense_date, payment_date')
        .gte('expense_date', prevYearStart)
        .lte('expense_date', prevYearEnd),

      // Get available years (distinct years from invoices/expenses)
      supabase
        .from('invoices')
        .select('issue_date')
        .order('issue_date', { ascending: false })
        .limit(1000)
    ])

    const rawYearInvoices = ((yearInvoicesResult.data || []) as ReportInvoice[])
      .filter(inv => !EXCLUDED_INVOICE_STATUSES.has((inv.status || '').toLowerCase()))
    const rawYearExpenses = ((yearExpensesResult.data || []) as ReportExpense[])
      .filter(exp => !EXCLUDED_EXPENSE_STATUSES.has((exp.status || '').toLowerCase()))
    const yearTrips = yearTripsResult.data || []
    const rawPrevYearInvoices = ((prevYearInvoicesResult.data || []) as ReportInvoice[])
      .filter(inv => !EXCLUDED_INVOICE_STATUSES.has((inv.status || '').toLowerCase()))
    const rawPrevYearExpenses = ((prevYearExpensesResult.data || []) as ReportExpense[])
      .filter(exp => !EXCLUDED_EXPENSE_STATUSES.has((exp.status || '').toLowerCase()))

    // ---------- Restate every amount into one reporting currency ----------
    // An invoice's face value belongs to the day it was raised; the amount
    // collected against it belongs to the day it was paid. Expenses convert
    // at the day the money left, falling back to the day the cost arose.
    const reportingCurrency = resolveReportingCurrency(
      [...rawYearInvoices, ...rawYearExpenses],
      searchParams.get('reportingCurrency')
    )
    const fxContext = await loadFxContext(supabase, {
      currencies: collectCurrencies(
        rawYearInvoices, rawYearExpenses, rawPrevYearInvoices, rawPrevYearExpenses
      ),
      reportingCurrency,
    })

    const invoiceSpec = {
      currency: (row: ReportInvoice) => row.currency,
      date: (row: ReportInvoice) => row.paid_at || row.issue_date,
      fields: [
        { name: 'total_amount', date: (row: ReportInvoice) => row.issue_date },
        'amount_paid',
        'balance_due',
      ],
      kind: 'invoice' as FxHole['kind'],
      reference: (row: ReportInvoice) => `Invoice ${row.invoice_number || row.id || ''}`.trim(),
    }

    const expenseSpec = {
      currency: (row: ReportExpense) => row.currency,
      date: (row: ReportExpense) => row.payment_date || row.expense_date,
      fields: ['amount'],
      kind: 'expense' as FxHole['kind'],
      reference: (row: ReportExpense) => `Expense ${row.expense_number || row.id || ''}`.trim(),
    }

    const convertedYearInvoices = convertMoneyRows(fxContext, rawYearInvoices, invoiceSpec)
    const convertedYearExpenses = convertMoneyRows(fxContext, rawYearExpenses, expenseSpec)
    const convertedPrevInvoices = convertMoneyRows(fxContext, rawPrevYearInvoices, invoiceSpec)
    const convertedPrevExpenses = convertMoneyRows(fxContext, rawPrevYearExpenses, expenseSpec)

    const fx = emptyFxSummary()
    for (const result of [
      convertedYearInvoices, convertedYearExpenses, convertedPrevInvoices, convertedPrevExpenses,
    ]) {
      mergeFxSummary(fx, result.fx)
    }
    const fxHoles: FxHole[] = [
      ...convertedYearInvoices.holes,
      ...convertedYearExpenses.holes,
      ...convertedPrevInvoices.holes,
      ...convertedPrevExpenses.holes,
    ]

    // Every figure below is now in `reportingCurrency`.
    const yearInvoices = convertedYearInvoices.rows
    const yearExpenses = convertedYearExpenses.rows
    const prevYearInvoices = convertedPrevInvoices.rows
    const prevYearExpensesList = convertedPrevExpenses.rows

    // Generate monthly data
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const monthlyData: MonthlyData[] = monthNames.map((monthName: string, index: number) => {
      const monthNum = index + 1

      const monthInvoices = yearInvoices.filter(inv => {
        if (!inv.issue_date) return false
        const invMonth = new Date(inv.issue_date).getMonth() + 1
        return invMonth === monthNum
      })

      const monthExpenses = yearExpenses.filter(exp => {
        if (!exp.expense_date) return false
        const expMonth = new Date(exp.expense_date).getMonth() + 1
        return expMonth === monthNum
      })

      const monthTrips = yearTrips.filter(itin => {
        if (!itin.start_date) return false
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
    ].map((q: any) => {
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
      .filter(inv => Number(inv.amount_paid || 0) > 0)
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
    const deductibleExpenses = yearExpenses.filter(exp => taxCategories.includes(exp.category || ''))
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
    const commissionExpenses = yearExpenses.filter(exp => commissionCategories.includes(exp.category || ''))

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
      by_type: commissionCategories.map((cat: string) => ({
        type: cat,
        amount: commissionExpenses
          .filter(exp => exp.category === cat)
          .reduce((sum, exp) => sum + Number(exp.amount || 0), 0),
        count: commissionExpenses.filter(exp => exp.category === cat).length
      })),
      recipients: commissionData
    }

    // Year-over-year comparison (using pre-fetched data)
    const prevYearRevenue = prevYearInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
    const prevYearExpenseTotal = prevYearExpensesList.reduce((sum, exp) => sum + Number(exp.amount || 0), 0)

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
      // What currency every figure below is stated in, and how exact it is.
      currency: {
        reporting_currency: reportingCurrency,
        fx,
        complete: fxHoles.length === 0,
        excluded_records: fxHoles.length,
        holes: fxHoles,
        fx_history_available: fxContext.historyAvailable,
      },
      summary,
      monthly: monthlyData,
      quarterly: quarterlyData,
      cashFlow,
      taxSummary,
      commissionSummary,
      yearOverYear,
      availableYears: [...new Set([
        ...(availableYearsResult.data || []).map((inv: any) => new Date(inv.issue_date).getFullYear()),
        year, // Always include current year
        prevYear // Always include previous year
      ])].filter(y => y > 2020).sort((a, b) => b - a)
    })
  } catch (error) {
    console.error('❌ Error in Financial Reports GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
