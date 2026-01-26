import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

/**
 * GET /api/billing/invoices
 * Get invoice history for the tenant
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant } = authResult
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const status = searchParams.get('status') // paid, open, void, etc.

    // Build query
    let query = supabase
      .from('billing_invoices')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenant.id)
      .order('invoice_date', { ascending: false })
      .range(offset, offset + limit - 1)

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status)
    }

    const { data: invoices, error, count } = await query

    if (error) throw error

    // Format invoices for frontend
    const formattedInvoices = (invoices || []).map(invoice => ({
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
      paid_at: invoice.paid_at,
      amount_due: invoice.amount_due,
      amount_paid: invoice.amount_paid,
      tax: invoice.tax,
      total: invoice.total,
      currency: invoice.currency,
      status: invoice.status,
      invoice_pdf_url: invoice.invoice_pdf_url,
      hosted_invoice_url: invoice.hosted_invoice_url,
      line_items: invoice.line_items
    }))

    return NextResponse.json({
      success: true,
      invoices: formattedInvoices,
      total: count || 0,
      limit,
      offset,
      has_more: (count || 0) > offset + limit
    })
  } catch (error: any) {
    console.error('Error fetching invoices:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
