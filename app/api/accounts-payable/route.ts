import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
// Money in different currencies does not add (lib/currency-totals.ts).
import { CurrencyTotals, emptyTotals, addToTotals, sumByCurrency } from '@/lib/currency-totals'

interface AgingBucket {
  current: CurrencyTotals
  days30: CurrencyTotals
  days60: CurrencyTotals
  days90Plus: CurrencyTotals
}

interface SupplierPayable {
  supplier_name: string
  supplier_type: string
  total_expenses: CurrencyTotals
  total_paid: CurrencyTotals
  total_outstanding: CurrencyTotals
  expense_count: number
  oldest_expense_date: string
  aging: AgingBucket
  expenses: any[]
}

export async function GET(request: NextRequest) {
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
    const searchParams = request.nextUrl.searchParams
    const supplierName = searchParams.get('supplierName')
    const supplierType = searchParams.get('supplierType')
    const agingFilter = searchParams.get('aging')
    const status = searchParams.get('status') // pending, approved, paid

    // Fetch all unpaid expenses (pending or approved but not paid)
    // RLS automatically filters by tenant_id
    let query = supabase
      .from('expenses')
      .select('*')
      .in('status', ['pending', 'approved'])
      .order('expense_date', { ascending: true })

    if (supplierName) {
      query = query.ilike('supplier_name', `%${supplierName}%`)
    }

    if (supplierType) {
      query = query.eq('supplier_type', supplierType)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data: expenses, error } = await query

    if (error) {
      console.error('Error fetching expenses:', error)
      return NextResponse.json({ error: 'Failed to fetch payables' }, { status: 500 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Calculate aging for each expense (based on expense_date, not due_date since expenses don't have due dates)
    const expensesWithAging = (expenses || []).map((exp: any) => {
      const expenseDate = new Date(exp.expense_date)
      expenseDate.setHours(0, 0, 0, 0)
      const daysOutstanding = Math.floor((today.getTime() - expenseDate.getTime()) / (1000 * 60 * 60 * 24))
      
      let agingBucket = 'current'
      if (daysOutstanding > 90) agingBucket = '90plus'
      else if (daysOutstanding > 60) agingBucket = '60'
      else if (daysOutstanding > 30) agingBucket = '30'
      else if (daysOutstanding > 14) agingBucket = 'overdue'

      return {
        ...exp,
        days_outstanding: Math.max(0, daysOutstanding),
        aging_bucket: agingBucket,
        is_overdue: daysOutstanding > 14 // Consider overdue after 2 weeks
      }
    })

    // Filter by aging if specified
    let filteredExpenses = expensesWithAging
    if (agingFilter) {
      switch (agingFilter) {
        case 'current':
          filteredExpenses = expensesWithAging.filter(exp => exp.days_outstanding <= 14)
          break
        case '30':
          filteredExpenses = expensesWithAging.filter(exp => exp.days_outstanding > 14 && exp.days_outstanding <= 30)
          break
        case '60':
          filteredExpenses = expensesWithAging.filter(exp => exp.days_outstanding > 30 && exp.days_outstanding <= 60)
          break
        case '90':
          filteredExpenses = expensesWithAging.filter(exp => exp.days_outstanding > 60)
          break
      }
    }

    // Group by supplier
    const supplierMap = new Map<string, SupplierPayable>()

    filteredExpenses.forEach(exp => {
      const supplierKey = exp.supplier_name || 'Unknown Supplier'
      
      if (!supplierMap.has(supplierKey)) {
        supplierMap.set(supplierKey, {
          supplier_name: exp.supplier_name || 'Unknown Supplier',
          supplier_type: exp.supplier_type || 'other',
          total_expenses: emptyTotals(),
          total_paid: emptyTotals(),
          total_outstanding: emptyTotals(),
          expense_count: 0,
          oldest_expense_date: exp.expense_date,
          aging: { current: emptyTotals(), days30: emptyTotals(), days60: emptyTotals(), days90Plus: emptyTotals() },
          expenses: []
        })
      }

      const supplier = supplierMap.get(supplierKey)!
      const amount = Number(exp.amount || 0)
      addToTotals(supplier.total_expenses, amount, exp.currency)
      addToTotals(supplier.total_outstanding, amount, exp.currency)
      supplier.expense_count += 1
      supplier.expenses.push(exp)

      // Update aging buckets
      if (exp.days_outstanding <= 14) {
        addToTotals(supplier.aging.current, amount, exp.currency)
      } else if (exp.days_outstanding <= 30) {
        addToTotals(supplier.aging.days30, amount, exp.currency)
      } else if (exp.days_outstanding <= 60) {
        addToTotals(supplier.aging.days60, amount, exp.currency)
      } else {
        addToTotals(supplier.aging.days90Plus, amount, exp.currency)
      }

      // Track oldest expense
      if (new Date(exp.expense_date) < new Date(supplier.oldest_expense_date)) {
        supplier.oldest_expense_date = exp.expense_date
      }
    })

    const supplierPayables = Array.from(supplierMap.values())
      .sort((a, b) => {
        // magnitude for ORDERING only — never displayed as one number
        const mag = (t: CurrencyTotals) => Object.values(t).reduce((x, v) => x + Math.abs(v), 0)
        return mag(b.total_outstanding) - mag(a.total_outstanding)
      })

    // Fetch paid expenses for payment history
    // RLS automatically filters by tenant_id
    const { data: paidExpenses } = await supabase
      .from('expenses')
      .select('*')
      .eq('status', 'paid')
      .order('payment_date', { ascending: false })
      .limit(50)

    // Calculate summary
    const merge = (into: CurrencyTotals, from: CurrencyTotals) => {
      for (const [code, v] of Object.entries(from)) into[code] = (into[code] || 0) + v
      return into
    }
    const currencies = [...new Set(filteredExpenses.map(e => (e.currency || 'EUR') as string))]

    const summary = {
      total_outstanding: supplierPayables.reduce((t, s) => merge(t, s.total_outstanding), emptyTotals()),
      supplier_count: supplierPayables.length,
      expense_count: filteredExpenses.length,
      aging: {
        current: supplierPayables.reduce((t, s) => merge(t, s.aging.current), emptyTotals()),
        days30: supplierPayables.reduce((t, s) => merge(t, s.aging.days30), emptyTotals()),
        days60: supplierPayables.reduce((t, s) => merge(t, s.aging.days60), emptyTotals()),
        days90Plus: supplierPayables.reduce((t, s) => merge(t, s.aging.days90Plus), emptyTotals())
      },
      pending_count: filteredExpenses.filter(e => e.status === 'pending').length,
      pending_amount: sumByCurrency(filteredExpenses.filter(e => e.status === 'pending'), e => e.amount, e => e.currency),
      approved_count: filteredExpenses.filter(e => e.status === 'approved').length,
      approved_amount: sumByCurrency(filteredExpenses.filter(e => e.status === 'approved'), e => e.amount, e => e.currency),
      overdue_count: filteredExpenses.filter(e => e.is_overdue).length,
      overdue_amount: sumByCurrency(filteredExpenses.filter(e => e.is_overdue), e => e.amount, e => e.currency),
      // exactly one currency present -> the page may draw percentage bars
      single_currency: currencies.length === 1 ? currencies[0] : (currencies.length === 0 ? 'EUR' : null)
    }

    // Group expenses by category for breakdown
    const categoryBreakdown: Record<string, CurrencyTotals> = {}
    filteredExpenses.forEach(exp => {
      const cat = exp.category || 'other'
      categoryBreakdown[cat] ??= emptyTotals()
      addToTotals(categoryBreakdown[cat], exp.amount, exp.currency)
    })

    // Group by supplier type
    const supplierTypeBreakdown: Record<string, CurrencyTotals> = {}
    filteredExpenses.forEach(exp => {
      const type = exp.supplier_type || 'other'
      supplierTypeBreakdown[type] ??= emptyTotals()
      addToTotals(supplierTypeBreakdown[type], exp.amount, exp.currency)
    })

    return NextResponse.json({
      success: true,
      data: supplierPayables,
      expenses: filteredExpenses,
      recentPayments: paidExpenses || [],
      summary,
      categoryBreakdown,
      supplierTypeBreakdown
    })
  } catch (error) {
    console.error('Error in AP GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}