import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
// Money in different currencies does not add (see lib/currency-totals.ts).
// Every aggregate here is kept PER CURRENCY; the page renders each bucket.
import { CurrencyTotals, emptyTotals, addToTotals, sumByCurrency } from '@/lib/currency-totals'

interface AgingBucket {
  current: CurrencyTotals
  days30: CurrencyTotals
  days60: CurrencyTotals
  days90Plus: CurrencyTotals
}

interface ClientReceivable {
  client_id: string
  client_name: string
  client_email: string
  total_invoiced: CurrencyTotals
  total_paid: CurrencyTotals
  total_outstanding: CurrencyTotals
  invoice_count: number
  oldest_invoice_date: string
  aging: AgingBucket
  invoices: any[]
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
    const clientId = searchParams.get('clientId')
    const agingFilter = searchParams.get('aging') // current, 30, 60, 90

    // Fetch all unpaid/partially paid invoices
    // RLS automatically filters by tenant_id
    let query = supabase
      .from('invoices')
      .select('*')
      .gt('balance_due', 0)
      .not('status', 'eq', 'cancelled')
      .order('due_date', { ascending: true })

    if (clientId) {
      query = query.eq('client_id', clientId)
    }

    const { data: invoices, error } = await query

    if (error) {
      console.error('Error fetching invoices:', error)
      return NextResponse.json({ error: 'Failed to fetch receivables' }, { status: 500 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Calculate aging for each invoice
    const invoicesWithAging = (invoices || []).map((inv: any) => {
      const dueDate = new Date(inv.due_date)
      dueDate.setHours(0, 0, 0, 0)
      const daysPastDue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
      
      let agingBucket = 'current'
      if (daysPastDue > 90) agingBucket = '90plus'
      else if (daysPastDue > 60) agingBucket = '60'
      else if (daysPastDue > 30) agingBucket = '30'
      else if (daysPastDue > 0) agingBucket = 'overdue'

      return {
        ...inv,
        days_past_due: Math.max(0, daysPastDue),
        aging_bucket: agingBucket,
        is_overdue: daysPastDue > 0
      }
    })

    // Filter by aging if specified
    let filteredInvoices = invoicesWithAging
    if (agingFilter) {
      switch (agingFilter) {
        case 'current':
          filteredInvoices = invoicesWithAging.filter(inv => inv.days_past_due <= 0)
          break
        case '30':
          filteredInvoices = invoicesWithAging.filter(inv => inv.days_past_due > 0 && inv.days_past_due <= 30)
          break
        case '60':
          filteredInvoices = invoicesWithAging.filter(inv => inv.days_past_due > 30 && inv.days_past_due <= 60)
          break
        case '90':
          filteredInvoices = invoicesWithAging.filter(inv => inv.days_past_due > 60)
          break
      }
    }

    // Group by client
    const clientMap = new Map<string, ClientReceivable>()

    filteredInvoices.forEach(inv => {
      const clientKey = inv.client_id || inv.client_name || 'unknown'
      
      if (!clientMap.has(clientKey)) {
        clientMap.set(clientKey, {
          client_id: inv.client_id,
          client_name: inv.client_name,
          client_email: inv.client_email,
          total_invoiced: emptyTotals(),
          total_paid: emptyTotals(),
          total_outstanding: emptyTotals(),
          invoice_count: 0,
          oldest_invoice_date: inv.issue_date,
          aging: { current: emptyTotals(), days30: emptyTotals(), days60: emptyTotals(), days90Plus: emptyTotals() },
          invoices: []
        })
      }

      const client = clientMap.get(clientKey)!
      addToTotals(client.total_invoiced, inv.total_amount, inv.currency)
      addToTotals(client.total_paid, inv.amount_paid, inv.currency)
      addToTotals(client.total_outstanding, inv.balance_due, inv.currency)
      client.invoice_count += 1
      client.invoices.push(inv)

      // Update aging buckets
      const bucket =
        inv.days_past_due <= 0 ? client.aging.current
        : inv.days_past_due <= 30 ? client.aging.days30
        : inv.days_past_due <= 60 ? client.aging.days60
        : client.aging.days90Plus
      addToTotals(bucket, inv.balance_due, inv.currency)

      // Track oldest invoice
      if (new Date(inv.issue_date) < new Date(client.oldest_invoice_date)) {
        client.oldest_invoice_date = inv.issue_date
      }
    })

    // Magnitude across buckets — ONLY for ordering, never displayed. Sorting
    // needs one number; showing one number is what this change removes.
    const magnitude = (t: CurrencyTotals) =>
      Object.values(t).reduce((s, v) => s + Math.abs(v), 0)
    const merge = (into: CurrencyTotals, from: CurrencyTotals) => {
      for (const [code, v] of Object.entries(from)) into[code] = (into[code] || 0) + v
      return into
    }

    const clientReceivables = Array.from(clientMap.values())
      .sort((a, b) => magnitude(b.total_outstanding) - magnitude(a.total_outstanding))

    // The currencies actually present. When there is exactly one, the page may
    // draw percentage bars; a percentage of mixed-currency money is not a number.
    const currencies = [...new Set(filteredInvoices.map(inv => (inv.currency || 'EUR') as string))]

    const summary = {
      total_outstanding: clientReceivables.reduce((t, c) => merge(t, c.total_outstanding), emptyTotals()),
      total_invoiced: clientReceivables.reduce((t, c) => merge(t, c.total_invoiced), emptyTotals()),
      total_paid: clientReceivables.reduce((t, c) => merge(t, c.total_paid), emptyTotals()),
      client_count: clientReceivables.length,
      invoice_count: filteredInvoices.length,
      aging: {
        current: clientReceivables.reduce((t, c) => merge(t, c.aging.current), emptyTotals()),
        days30: clientReceivables.reduce((t, c) => merge(t, c.aging.days30), emptyTotals()),
        days60: clientReceivables.reduce((t, c) => merge(t, c.aging.days60), emptyTotals()),
        days90Plus: clientReceivables.reduce((t, c) => merge(t, c.aging.days90Plus), emptyTotals())
      },
      overdue_count: filteredInvoices.filter(inv => inv.is_overdue).length,
      overdue_amount: sumByCurrency(
        filteredInvoices.filter(inv => inv.is_overdue),
        inv => inv.balance_due,
        inv => inv.currency
      ),
      single_currency: currencies.length === 1 ? currencies[0] : (currencies.length === 0 ? 'EUR' : null)
    }

    return NextResponse.json({
      success: true,
      data: clientReceivables,
      invoices: filteredInvoices,
      summary
    })
  } catch (error) {
    console.error('Error in AR GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}