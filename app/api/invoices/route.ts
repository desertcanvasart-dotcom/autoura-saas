// app/api/invoices/route.ts
// ============================================
// AUTOURA - INVOICES API
// ============================================
// Manages invoices (standard, deposit, final)
// Multi-tenancy: Enforces tenant isolation via RLS
// Security: Requires authentication for all operations
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

/**
 * GET /api/invoices
 * List invoices for authenticated user's tenant
 * Query params: status, clientId, itineraryId, type
 * RLS policies automatically filter by tenant_id
 */
export async function GET(request: NextRequest) {
  try {
    // Use authenticated client - RLS automatically filters by tenant
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
    const status = searchParams.get('status')
    const clientId = searchParams.get('clientId')
    const itineraryId = searchParams.get('itineraryId')
    const invoiceType = searchParams.get('type')

    let query = supabase
      .from('invoices')
      .select(`
        *,
        itineraries (
          client_phone
        )
      `)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    if (clientId) {
      query = query.eq('client_id', clientId)
    }

    if (itineraryId) {
      query = query.eq('itinerary_id', itineraryId)
    }

    if (invoiceType) {
      query = query.eq('invoice_type', invoiceType)
    }

    const { data, error } = await query

    if (error) {
      console.error('❌ Error fetching invoices:', error)
      return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
    }

    // Flatten the response to include client_phone at the top level
    const formattedData = (data || []).map((invoice: any) => ({
      ...invoice,
      client_phone: invoice.itineraries?.client_phone || null,
      itineraries: undefined // Remove nested object
    }))

    return NextResponse.json(formattedData)
  } catch (error) {
    console.error('❌ Error in invoices GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/invoices
 * Create a new invoice (standard, deposit, or final)
 * Requires authentication and validates tenant ownership
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
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
    if (!body.client_name) {
      return NextResponse.json(
        { error: 'Client name is required' },
        { status: 400 }
      )
    }

    // If itinerary_id provided, verify it belongs to this tenant
    if (body.itinerary_id) {
      const { data: itinerary, error: itineraryError } = await supabase
        .from('itineraries')
        .select('id, tenant_id')
        .eq('id', body.itinerary_id)
        .single()

      if (itineraryError || !itinerary) {
        return NextResponse.json(
          { error: 'Itinerary not found or access denied' },
          { status: 404 }
        )
      }

      if (itinerary.tenant_id !== tenant_id) {
        return NextResponse.json(
          { error: 'Cannot create invoice for itinerary from another tenant' },
          { status: 403 }
        )
      }
    }

    // Generate invoice number with type suffix
    const year = new Date().getFullYear()

    // Try to use sequence function (works even with authenticated client)
    const { data: seqData, error: seqError } = await supabase
      .rpc('nextval', { seq_name: 'invoice_number_seq' })

    let baseNumber = 1
    if (!seqError && seqData) {
      baseNumber = seqData
    } else {
      // Fallback: count invoices in THIS TENANT only (RLS filters automatically)
      const { count } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
      baseNumber = (count || 0) + 1
    }

    // Determine invoice type and number suffix
    const invoiceType = body.invoice_type || 'standard'
    let invoiceNumber = `INV-${year}-${String(baseNumber).padStart(3, '0')}`

    if (invoiceType === 'deposit') {
      invoiceNumber = `INV-${year}-${String(baseNumber).padStart(3, '0')}-DEP`
    } else if (invoiceType === 'final') {
      invoiceNumber = `INV-${year}-${String(baseNumber).padStart(3, '0')}-FIN`
    }

    // Calculate amounts based on invoice type
    let totalAmount = body.total_amount || 0
    let lineItems = body.line_items || []
    const depositPercent = body.deposit_percent || 10
    const fullTripCost = body.full_trip_cost || totalAmount // Store original trip cost

    if (invoiceType === 'deposit') {
      // Deposit invoice: calculate deposit amount
      totalAmount = (fullTripCost * depositPercent) / 100
      lineItems = [{
        description: `Booking Deposit (${depositPercent}%) - ${body.line_items?.[0]?.description || 'Tour Package'}`,
        quantity: 1,
        unit_price: totalAmount,
        amount: totalAmount
      }]
    } else if (invoiceType === 'final') {
      // Final invoice: remaining balance after deposit
      const depositAmount = (fullTripCost * depositPercent) / 100
      totalAmount = fullTripCost - depositAmount
      lineItems = [{
        description: `Balance Payment - ${body.line_items?.[0]?.description || 'Tour Package'}`,
        quantity: 1,
        unit_price: totalAmount,
        amount: totalAmount
      }, {
        description: `Less: Deposit Paid (${depositPercent}%)`,
        quantity: 1,
        unit_price: -depositAmount,
        amount: -depositAmount
      }]
      // Adjust total to just show the balance
      lineItems = [{
        description: `Final Balance - ${body.line_items?.[0]?.description || 'Tour Package'} (Total: ${body.currency || 'EUR'} ${fullTripCost.toFixed(2)} minus ${depositPercent}% deposit)`,
        quantity: 1,
        unit_price: totalAmount,
        amount: totalAmount
      }]
    }

    const newInvoice = {
      tenant_id, // ✅ Explicit tenant_id
      invoice_number: invoiceNumber,
      invoice_type: invoiceType,
      deposit_percent: depositPercent,
      parent_invoice_id: body.parent_invoice_id || null,
      client_id: body.client_id,
      itinerary_id: body.itinerary_id || null,
      client_name: body.client_name,
      client_email: body.client_email || null,
      line_items: lineItems,
      subtotal: totalAmount,
      tax_rate: body.tax_rate || 0,
      tax_amount: body.tax_amount || 0,
      discount_amount: body.discount_amount || 0,
      total_amount: totalAmount,
      currency: body.currency || 'EUR',
      amount_paid: 0,
      balance_due: totalAmount,
      status: 'draft',
      issue_date: body.issue_date || new Date().toISOString().split('T')[0],
      due_date: body.due_date || null,
      notes: body.notes || null,
      payment_terms: body.payment_terms || getDefaultPaymentTerms(invoiceType),
      payment_instructions: body.payment_instructions || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('invoices')
      .insert([newInvoice])
      .select()
      .single()

    if (error) {
      console.error('❌ Error creating invoice:', error)
      return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('❌ Error in invoices POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function getDefaultPaymentTerms(invoiceType: string): string {
  switch (invoiceType) {
    case 'deposit':
      return 'Deposit required to confirm booking. Non-refundable once services are confirmed.'
    case 'final':
      return 'Balance payable in cash upon arrival or before first day of service.'
    default:
      return 'Payment due within 14 days'
  }
}
