import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

interface AgingBucket {
  current: number
  days30: number
  days60: number
  days90Plus: number
}

interface SupplierPayable {
  supplier_name: string
  supplier_type: string
  total_expenses: number
  total_paid: number
  total_outstanding: number
  expense_count: number
  oldest_expense_date: string
  aging: AgingBucket
  expenses: any[]
}

export async function GET(request: NextRequest) {
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
          total_expenses: 0,
          total_paid: 0,
          total_outstanding: 0,
          expense_count: 0,
          oldest_expense_date: exp.expense_date,
          aging: { current: 0, days30: 0, days60: 0, days90Plus: 0 },
          expenses: []
        })
      }

      const supplier = supplierMap.get(supplierKey)!
      const amount = Number(exp.amount || 0)
      supplier.total_expenses += amount
      supplier.total_outstanding += amount
      supplier.expense_count += 1
      supplier.expenses.push(exp)

      // Update aging buckets
      if (exp.days_outstanding <= 14) {
        supplier.aging.current += amount
      } else if (exp.days_outstanding <= 30) {
        supplier.aging.days30 += amount
      } else if (exp.days_outstanding <= 60) {
        supplier.aging.days60 += amount
      } else {
        supplier.aging.days90Plus += amount
      }

      // Track oldest expense
      if (new Date(exp.expense_date) < new Date(supplier.oldest_expense_date)) {
        supplier.oldest_expense_date = exp.expense_date
      }
    })

    const supplierPayables = Array.from(supplierMap.values())
      .sort((a, b) => b.total_outstanding - a.total_outstanding)

    // Fetch paid expenses for payment history
    // RLS automatically filters by tenant_id
    const { data: paidExpenses } = await supabase
      .from('expenses')
      .select('*')
      .eq('status', 'paid')
      .order('payment_date', { ascending: false })
      .limit(50)

    // Calculate summary
    const summary = {
      total_outstanding: supplierPayables.reduce((sum, s) => sum + s.total_outstanding, 0),
      supplier_count: supplierPayables.length,
      expense_count: filteredExpenses.length,
      aging: {
        current: supplierPayables.reduce((sum, s) => sum + s.aging.current, 0),
        days30: supplierPayables.reduce((sum, s) => sum + s.aging.days30, 0),
        days60: supplierPayables.reduce((sum, s) => sum + s.aging.days60, 0),
        days90Plus: supplierPayables.reduce((sum, s) => sum + s.aging.days90Plus, 0)
      },
      pending_count: filteredExpenses.filter(e => e.status === 'pending').length,
      pending_amount: filteredExpenses.filter(e => e.status === 'pending').reduce((sum, e) => sum + Number(e.amount || 0), 0),
      approved_count: filteredExpenses.filter(e => e.status === 'approved').length,
      approved_amount: filteredExpenses.filter(e => e.status === 'approved').reduce((sum, e) => sum + Number(e.amount || 0), 0),
      overdue_count: filteredExpenses.filter(e => e.is_overdue).length,
      overdue_amount: filteredExpenses.filter(e => e.is_overdue).reduce((sum, e) => sum + Number(e.amount || 0), 0)
    }

    // Group expenses by category for breakdown
    const categoryBreakdown: Record<string, number> = {}
    filteredExpenses.forEach(exp => {
      const cat = exp.category || 'other'
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + Number(exp.amount || 0)
    })

    // Group by supplier type
    const supplierTypeBreakdown: Record<string, number> = {}
    filteredExpenses.forEach(exp => {
      const type = exp.supplier_type || 'other'
      supplierTypeBreakdown[type] = (supplierTypeBreakdown[type] || 0) + Number(exp.amount || 0)
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