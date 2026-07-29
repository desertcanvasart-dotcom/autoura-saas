// GET  /api/supplier-invoices — list (filters) + summary stats
// POST /api/supplier-invoices — create (auto internal_reference)
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'
import { nextDocumentNumber, insertWithUniqueRetry } from '@/lib/document-numbering'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createAuthenticatedClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const sp = request.nextUrl.searchParams
    let query = supabase.from('supplier_invoices').select('*').order('invoice_date', { ascending: false })
    const status = sp.get('status')
    if (status) query = query.eq('status', status)
    const matchStatus = sp.get('matchStatus')
    if (matchStatus) query = query.eq('match_status', matchStatus)
    if (sp.get('supplierName')) query = query.ilike('supplier_name', `%${sp.get('supplierName')}%`)
    if (sp.get('startDate')) query = query.gte('invoice_date', sp.get('startDate'))
    if (sp.get('endDate')) query = query.lte('invoice_date', sp.get('endDate'))

    const { data, error } = await query
    if (error) {
      console.error('Error fetching supplier invoices:', error.message)
      return NextResponse.json({ success: true, data: [], summary: emptySummary() })
    }

    const all = data || []
    const summary = {
      total: all.length,
      total_amount: all.reduce((s, si) => s + Number(si.amount || 0), 0),
      received: all.filter(si => si.status === 'received').length,
      unmatched: all.filter(si => si.match_status === 'unmatched').length,
      matched_pending: all.filter(si => si.status === 'matched').length,
      approved: all.filter(si => si.status === 'approved').length,
      paid: all.filter(si => si.status === 'paid').length,
      disputed: all.filter(si => si.status === 'disputed').length,
    }
    return NextResponse.json({ success: true, data: all, summary })
  } catch (e: any) {
    console.error('supplier-invoices GET error:', e?.message)
    return NextResponse.json({ success: true, data: [], summary: emptySummary() })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase || !auth.tenant_id || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase, tenant_id, user } = auth
    const body = await request.json()

    if (!body.supplier_invoice_number || !body.supplier_name || !body.invoice_date || body.amount == null) {
      return NextResponse.json(
        { success: false, error: 'supplier_invoice_number, supplier_name, invoice_date, and amount are required' },
        { status: 400 }
      )
    }

    // Internal reference generation goes through nextDocumentNumber (sequence-
    // first with year-scoped MAX fallback). The INSERT is wrapped in
    // insertWithUniqueRetry so a 23505 violation from the new UNIQUE constraint
    // regenerates the reference and retries.
    const baseSupplierInvoice = {
      tenant_id,
      supplier_invoice_number: body.supplier_invoice_number,
      supplier_name: body.supplier_name,
      supplier_id: body.supplier_id || null,
      invoice_date: body.invoice_date,
      due_date: body.due_date || null,
      amount: body.amount,
      currency: body.currency || 'EUR',
      tax_amount: body.tax_amount || 0,
      description: body.description || null,
      line_items: body.line_items || null,
      notes: body.notes || null,
      itinerary_id: body.itinerary_id || null,
      booking_id: body.booking_id || null,
      client_invoice_id: body.client_invoice_id || null,
      document_url: body.document_url || null,
      document_filename: body.document_filename || null,
      created_by: user.id,
    }

    const { data, error } = await insertWithUniqueRetry({
      generateRow: async () => ({
        ...baseSupplierInvoice,
        internal_reference: await nextDocumentNumber({
          supabase,
          prefix: 'SI',
          table: 'supplier_invoices',
          column: 'internal_reference',
        }),
      }),
      insert: async (row) => await supabase.from('supplier_invoices').insert(row).select().single(),
    })

    if (error) {
      console.error('Error creating supplier invoice:', error.message)
      return NextResponse.json({ success: false, error: 'Failed to create supplier invoice' }, { status: 500 })
    }
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (e: any) {
    console.error('supplier-invoices POST error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

function emptySummary() {
  return { total: 0, total_amount: 0, received: 0, unmatched: 0, matched_pending: 0, approved: 0, paid: 0, disputed: 0 }
}
