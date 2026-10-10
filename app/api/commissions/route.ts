import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { addToTotals, emptyTotals, sumByCurrency, type CurrencyTotals } from '@/lib/currency-totals'

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
    const type = searchParams.get('type') // receivable, payable
    const category = searchParams.get('category')
    const status = searchParams.get('status')
    const supplierId = searchParams.get('supplierId')
    const itineraryId = searchParams.get('itineraryId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // RLS automatically filters by tenant_id
    let query = supabase
      .from('commissions')
      .select(`
        *,
        supplier:suppliers(id, name, type),
        itinerary:itineraries(id, itinerary_code, client_name),
        client:clients(id, first_name, last_name, email)
      `)
      .order('transaction_date', { ascending: false })

    if (type) query = query.eq('commission_type', type)
    if (category) query = query.eq('category', category)
    if (status) query = query.eq('status', status)
    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (itineraryId) query = query.eq('itinerary_id', itineraryId)
    if (startDate) query = query.gte('transaction_date', startDate)
    if (endDate) query = query.lte('transaction_date', endDate)

    const { data, error } = await query

    if (error) {
      console.error('Error fetching commissions:', error)
      return NextResponse.json({ error: 'Failed to fetch commissions' }, { status: 500 })
    }

    // Calculate summary stats
    const receivable = (data || []).filter(c => c.commission_type === 'receivable')
    const payable = (data || []).filter(c => c.commission_type === 'payable')

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
      pending_receivable: totals(receivable.filter(c => c.status === 'pending' || c.status === 'invoiced')),
      pending_payable: totals(payable.filter(c => c.status === 'pending')),
      received: totals(receivable.filter(c => c.status === 'received')),
      paid: totals(payable.filter(c => c.status === 'paid')),
      net_commission: net,
      by_category: {} as Record<string, { receivable: CurrencyTotals; payable: CurrencyTotals; count: number }>
    }

    // Group by category
    ;(data || []).forEach(c => {
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

    // Validate required fields
    if (!body.commission_type || !body.category || !body.commission_amount) {
      return NextResponse.json(
        { error: 'Commission type, category, and amount are required' },
        { status: 400 }
      )
    }

    // Calculate commission amount from rate if provided
    let commissionAmount = Number(body.commission_amount)
    if (body.base_amount && body.commission_rate && !body.commission_amount) {
      commissionAmount = (Number(body.base_amount) * Number(body.commission_rate)) / 100
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
      base_amount: body.base_amount || 0,
      commission_rate: body.commission_rate || null,
      commission_amount: commissionAmount,
      currency: body.currency || 'EUR',
      status: body.status || 'pending',
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