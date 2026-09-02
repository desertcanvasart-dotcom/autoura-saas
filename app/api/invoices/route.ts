// app/api/invoices/route.ts
// ============================================
// AUTOURA - INVOICES API
// ============================================
// Manages invoices (standard, deposit, final)
// Multi-tenancy: Enforces tenant isolation via RLS
// Security: Requires authentication for all operations
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { includeAdditions, partitionAdditions, toLineItems, type Addition } from '@/lib/invoice-additions'
import { extrasAdmin } from '@/lib/booking-extras-db'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'
import { nextDocumentNumber, insertWithUniqueRetry } from '@/lib/document-numbering'

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

    // Pagination. Callers may opt in with ?limit / ?offset. When neither is
    // supplied we still apply a safety cap so a tenant with a very large
    // invoice history can't load the entire table into memory in one request.
    const SAFETY_CAP = 1000
    const limitParam = parseInt(searchParams.get('limit') || '')
    const offsetParam = parseInt(searchParams.get('offset') || '')
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, SAFETY_CAP)
      : SAFETY_CAP
    const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0

    let query = supabase
      .from('invoices')
      .select(`
        *,
        itineraries (
          client_phone
        )
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

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
    if (authResult.error !== null) {
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

    // Invoice number generation goes through nextDocumentNumber (sequence-first
    // with a year-scoped lexicographic-MAX fallback that accepts 0 and tolerates
    // row deletions), and the INSERT below is wrapped in insertWithUniqueRetry
    // so a 23505 violation from the new UNIQUE constraint regenerates the
    // number rather than crashing the request. The deposit/final type suffix
    // is appended at row-build time so the same base number stays in sync.
    const invoiceType = body.invoice_type || 'standard'
    const buildInvoiceNumber = async () => {
      const base = await nextDocumentNumber({
        supabase,
        prefix: 'INV',
        table: 'invoices',
        column: 'invoice_number',
      })
      if (invoiceType === 'deposit') return `${base}-DEP`
      if (invoiceType === 'final') return `${base}-FIN`
      return base
    }

    // Calculate amounts based on invoice type
    let totalAmount = body.total_amount || 0
    let lineItems = body.line_items || []
    const depositPercent = body.deposit_percent || 10
    const fullTripCost = body.full_trip_cost || totalAmount // Store original trip cost
    const currency = body.currency || 'EUR'

    // Extras and upgrades sold after the trip was priced (migration 321) are
    // added HERE rather than by each caller, so every invoice for a trip picks
    // them up the same way — and only when CONFIRMED and not yet billed.
    // Ported from travel-ops-pro (lib/invoice-additions).
    const additions: Addition[] = []
    let billedExtraIds: string[] = []
    if (body.itinerary_id) {
      const { data: extras, error: extrasError } = await extrasAdmin()
        .from('booking_extras')
        .select('id, title, kind, quantity, unit_price, currency, bookings!inner(itinerary_id, tenant_id)')
        .eq('status', 'confirmed')
        .is('invoiced_at', null)
        .eq('tenant_id', tenant_id)
        .eq('bookings.itinerary_id', body.itinerary_id)
      // A database without migration 321 answers with an error. An invoice for
      // the trip itself is still correct, so it is raised without them.
      if (extrasError) console.error('invoices: could not read extras', extrasError)
      for (const e of (extras ?? []) as Array<{ id: string; title: string; kind: string; quantity: number; unit_price: number; currency: string | null }>) {
        additions.push({
          id: String(e.id),
          source: 'extra',
          description: e.kind === 'upgrade' ? `${e.title} (upgrade)` : String(e.title),
          quantity: Number(e.quantity) || 1,
          unit_price: Number(e.unit_price),
          currency: String(e.currency || currency),
        })
      }
    }
    const parts = partitionAdditions(additions, currency)
    const additionsTotal = parts.total
    const additionLines = toLineItems(parts.billable, currency)
    billedExtraIds = parts.billable.filter(a => a.source === 'extra' && a.id).map(a => a.id as string)

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

    // Extras settle with the BALANCE, on exactly one document: not on a
    // deposit (a percentage on account against the tour), and appended LAST
    // because the type branches above rebuild lineItems from scratch.
    if (additionsTotal && includeAdditions(invoiceType)) {
      totalAmount = Math.round((totalAmount + additionsTotal) * 100) / 100
      lineItems = [...lineItems, ...additionLines]
    }

    const baseInvoice = {
      tenant_id, // ✅ Explicit tenant_id
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
      // Attribution (mig 269): the staff member issuing the invoice.
      created_by: authResult.user!.id,
      notes: body.notes || null,
      payment_terms: body.payment_terms || getDefaultPaymentTerms(invoiceType),
      payment_instructions: body.payment_instructions || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await insertWithUniqueRetry({
      generateRow: async () => ({ ...baseInvoice, invoice_number: await buildInvoiceNumber() }),
      insert: async (row) => await supabase.from('invoices').insert([row]).select().single(),
    })

    if (error) {
      console.error('❌ Error creating invoice:', error)
      return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
    }

    // Stamp the extras this document bills, so the next invoice for the trip
    // (which filters on invoiced_at IS NULL) cannot bill them again. Loud on
    // failure, because the failure mode is silent double-billing later.
    if (data?.id && billedExtraIds.length && includeAdditions(invoiceType)) {
      const { error: stampError } = await extrasAdmin()
        .from('booking_extras')
        .update({ invoiced_at: new Date().toISOString(), invoice_id: data.id })
        .in('id', billedExtraIds)
        .eq('tenant_id', tenant_id)
      if (stampError) console.error('invoices: could not stamp extras as invoiced', stampError)
    }

    return NextResponse.json(
      parts.otherCurrency.length
        ? { ...data, extras_in_other_currency: parts.otherCurrency.map(a => ({ id: a.id, description: a.description, currency: a.currency })) }
        : data,
      { status: 201 }
    )
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
