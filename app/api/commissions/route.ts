import { gateRole, roleDenied } from '@/lib/api-role-gate'
import { checkCommissionFields } from '@/lib/commissions/commission-fields'
import { fetchAllPages } from '@/lib/db/fetch-all-pages'
import { recordsInTenant } from '@/lib/quotes/records-in-tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { addToTotals, emptyTotals, sumByCurrency, type CurrencyTotals } from '@/lib/currency-totals'

/** The columns the summary reads; the rest pass through to the page. */
interface CommissionRow {
  commission_type: string | null
  category: string
  status: string | null
  commission_amount: number | null
  currency: string | null
  [column: string]: unknown
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
    // One trip's commissions are shown on the trip (staff); the full ledger
    // and its summary are Finance (managers and admins).
    const roleGate = roleDenied(authResult.role, searchParams.get('itineraryId') ? 'staff' : 'manage')
    if (roleGate) return roleGate
    const type = searchParams.get('type') // receivable, payable
    const category = searchParams.get('category')
    const status = searchParams.get('status')
    const supplierId = searchParams.get('supplierId')
    const itineraryId = searchParams.get('itineraryId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // RLS automatically filters by tenant_id. Every row, a page at a time —
    // the summary was worked out from a list cut at 1000.
    const { data, error } = await fetchAllPages<CommissionRow>((from, to) => {
      let query = supabase
        .from('commissions')
        .select(`
          *,
          supplier:suppliers(id, name, type),
          itinerary:itineraries(id, itinerary_code, client_name),
          client:clients(id, first_name, last_name, email)
        `)
        .order('transaction_date', { ascending: false })
        .order('id', { ascending: true })
      if (type) query = query.eq('commission_type', type)
      if (category) query = query.eq('category', category)
      if (status) query = query.eq('status', status)
      if (supplierId) query = query.eq('supplier_id', supplierId)
      if (itineraryId) query = query.eq('itinerary_id', itineraryId)
      if (startDate) query = query.gte('transaction_date', startDate)
      if (endDate) query = query.lte('transaction_date', endDate)
      return query.range(from, to)
    })

    if (error) {
      console.error('Error fetching commissions:', error)
      return NextResponse.json({ error: 'Failed to fetch commissions' }, { status: 500 })
    }

    // Calculate summary stats. Cancelled commissions are not money in or out.
    const live = (data || []).filter(c => c.status !== 'cancelled')
    const receivable = live.filter(c => c.commission_type === 'receivable')
    const payable = live.filter(c => c.commission_type === 'payable')
    // Settled is received or paid, whichever word the row carries (the form
    // offers both for either direction, and a "paid" receivable fell in no card).
    const settled = (c: { status?: string | null }) => c.status === 'received' || c.status === 'paid'

    // Per currency (lib/currency-totals): commissions in yen, euros and
    // dollars were added together and the sum labelled as euros (documents audit,
    // round 12).
    const totals = (rows: typeof receivable) => sumByCurrency(rows, c => c.commission_amount, c => c.currency)
    const receivableTotals = totals(receivable)
    const payableTotals = totals(payable)
    const net = { ...receivableTotals }
    for (const [code, v] of Object.entries(payableTotals)) net[code] = (net[code] ?? 0) - v
    const summary = {
      total_receivable: receivableTotals,
      total_payable: payableTotals,
      pending_receivable: totals(receivable.filter(c => !settled(c))),
      pending_payable: totals(payable.filter(c => !settled(c))),
      received: totals(receivable.filter(settled)),
      paid: totals(payable.filter(settled)),
      net_commission: net,
      by_category: {} as Record<string, { receivable: CurrencyTotals; payable: CurrencyTotals; count: number }>
    }

    // Group by category
    live.forEach(c => {
      if (!summary.by_category[c.category]) {
        summary.by_category[c.category] = { receivable: emptyTotals(), payable: emptyTotals(), count: 0 }
      }
      summary.by_category[c.category].count++
      addToTotals(
        summary.by_category[c.category][c.commission_type === 'receivable' ? 'receivable' : 'payable'],
        c.commission_amount,
        c.currency
      )
    })

    return NextResponse.json({
      success: true,
      data: data || [],
      summary
    })
  } catch (error) {
    console.error('Error in commissions GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Viewers read nothing here and change nothing; deletes and the
  // finance-only areas are for managers and admins (lib/api-role-gate).
  const roleGate = await gateRole('manage')
  if (roleGate) return roleGate

  try {
    // Require authentication
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const body = await request.json()

    // The amount, or a base and a rate to work it out from (that branch
    // could never run: the amount was required first).
    let commissionAmount: unknown = body.commission_amount
    if ((commissionAmount === undefined || commissionAmount === null || commissionAmount === '') && body.base_amount && body.commission_rate) {
      commissionAmount = Math.round(Number(body.base_amount) * Number(body.commission_rate)) / 100
    }
    if (!body.commission_type || !body.category || commissionAmount === undefined || commissionAmount === null || commissionAmount === '') {
      return NextResponse.json(
        { error: 'Commission type, category, and amount (or base and rate) are required' },
        { status: 400 }
      )
    }
    const checked: Record<string, unknown> = {
      commission_type: body.commission_type,
      status: body.status || 'pending',
      commission_amount: commissionAmount,
      base_amount: body.base_amount === '' || body.base_amount == null ? null : body.base_amount,
      commission_rate: body.commission_rate === '' || body.commission_rate == null ? null : body.commission_rate,
      currency: body.currency || null,
      transaction_date: body.transaction_date || null,
      due_date: body.due_date || null,
      paid_date: body.paid_date || null,
    }
    const bad = checkCommissionFields(checked)
    if (bad) return NextResponse.json({ error: bad }, { status: 400 })

    // The supplier, client and trip must be this agency's (the edit route
    // checked; the create route did not).
    const refs = await recordsInTenant(supabase, tenant_id, { client_id: body.client_id || undefined, itinerary_id: body.itinerary_id || undefined })
    if (!refs.ok) return NextResponse.json({ error: refs.error }, { status: refs.status })
    if (body.supplier_id) {
      const { data: sup } = await supabase.from('suppliers').select('id').eq('id', body.supplier_id).maybeSingle()
      if (!sup) return NextResponse.json({ error: 'Supplier not found or access denied' }, { status: 404 })
    }
    // No currency picked: the agency's (it was always EUR).
    let currency = checked.currency as string | null
    if (!currency) {
      const { data: t } = await supabase.from('tenants').select('default_currency').eq('id', tenant_id).maybeSingle()
      currency = (t as { default_currency?: string | null } | null)?.default_currency || 'EUR'
    }

    const newCommission = {
      tenant_id, // ✅ Explicitly set tenant_id
      itinerary_id: body.itinerary_id || null,
      supplier_id: body.supplier_id || null,
      client_id: body.client_id || null,
      commission_type: body.commission_type,
      category: body.category,
      source_name: body.source_name || null,
      source_contact: body.source_contact || null,
      description: body.description || null,
      base_amount: (checked.base_amount as number | null) ?? 0,
      commission_rate: checked.commission_rate as number | null,
      commission_amount: checked.commission_amount as number,
      currency,
      status: checked.status as string,
      transaction_date: body.transaction_date || new Date().toISOString().split('T')[0],
      due_date: body.due_date || null,
      paid_date: body.paid_date || null,
      payment_method: body.payment_method || null,
      payment_reference: body.payment_reference || null,
      notes: body.notes || null
    }

    // RLS will enforce tenant isolation
    const { data, error } = await supabase
      .from('commissions')
      .insert([newCommission])
      .select(`
        *,
        supplier:suppliers(id, name, type),
        itinerary:itineraries(id, itinerary_code, client_name)
      `)
      .single()

    if (error) {
      console.error('Error creating commission:', error)
      return NextResponse.json({ error: 'Failed to create commission' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error('Error in commissions POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}