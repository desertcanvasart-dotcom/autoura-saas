// GET  /api/supplier-invoices — list (filters) + summary stats
// POST /api/supplier-invoices — create (auto internal_reference)
import { gateRole } from '@/lib/api-role-gate'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'
import { nextDocumentNumber, insertWithUniqueRetry } from '@/lib/document-numbering'
import { fetchAllPages } from '@/lib/db/fetch-all-pages'
import { sumByCurrency } from '@/lib/currency-totals'
import { SUPPORTED_CURRENCIES } from '@/lib/currency'

export async function GET(request: NextRequest) {
  // Viewers read nothing here and change nothing; deletes and the
  // finance-only areas are for managers and admins (lib/api-role-gate).
  const roleGate = await gateRole('manage')
  if (roleGate) return roleGate

  try {
    const supabase = await createAuthenticatedClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const sp = request.nextUrl.searchParams
    // Every bill, a page at a time; the filters are applied below so the
    // summary cards count all bills — filtered by status, they read 0 for
    // every other status.
    const { data: everyBill, error } = await fetchAllPages<Record<string, unknown>>((from, to) =>
      supabase.from('supplier_invoices').select('*').order('invoice_date', { ascending: false }).order('id', { ascending: true }).range(from, to)
    )
    if (error) {
      // An error, not "No supplier invoices yet".
      console.error('Error fetching supplier invoices:', (error as { message?: string }).message)
      return NextResponse.json({ success: false, error: 'Could not load supplier invoices' }, { status: 500 })
    }

    const status = sp.get('status')
    const matchStatus = sp.get('matchStatus')
    const supplierName = (sp.get('supplierName') || '').trim().toLowerCase()
    const startDate = sp.get('startDate')
    const endDate = sp.get('endDate')
    const all = everyBill.filter(si =>
      (!status || si.status === status) &&
      (!matchStatus || si.match_status === matchStatus) &&
      (!supplierName || String(si.supplier_name || '').toLowerCase().includes(supplierName)) &&
      (!startDate || String(si.invoice_date || '') >= startDate) &&
      (!endDate || String(si.invoice_date || '') <= endDate))

    const summary = {
      total: everyBill.length,
      // Per currency (lib/currency-totals): a USD and an EGP bill were added
      // together and shown with a euro sign. Cancelled bills are owed by no one.
      total_amount: sumByCurrency(everyBill.filter(si => si.status !== 'cancelled'), si => si.amount, si => si.currency as string),
      received: everyBill.filter(si => si.status === 'received').length,
      unmatched: everyBill.filter(si => si.match_status === 'unmatched' && si.status !== 'cancelled').length,
      matched_pending: everyBill.filter(si => si.status === 'matched').length,
      approved: everyBill.filter(si => si.status === 'approved').length,
      paid: everyBill.filter(si => si.status === 'paid').length,
      disputed: everyBill.filter(si => si.status === 'disputed').length,
    }
    return NextResponse.json({ success: true, data: all, summary })
  } catch (e: any) {
    console.error('supplier-invoices GET error:', e?.message)
    return NextResponse.json({ success: false, error: 'Could not load supplier invoices' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Viewers read nothing here and change nothing; deletes and the
  // finance-only areas are for managers and admins (lib/api-role-gate).
  const roleGate = await gateRole('manage')
  if (roleGate) return roleGate

  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase || !auth.tenant_id || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase, tenant_id, user } = auth
    const body = await request.json()

    const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    if (!t(body.supplier_invoice_number) || !t(body.supplier_name) || !t(body.invoice_date) || body.amount == null || body.amount === '') {
      return NextResponse.json(
        { success: false, error: "The supplier's invoice number, the supplier, the invoice date and the amount are required" },
        { status: 400 }
      )
    }
    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: 'The amount must be a number above 0' }, { status: 400 })
    }
    const tax = body.tax_amount == null || body.tax_amount === '' ? 0 : Number(body.tax_amount)
    if (!Number.isFinite(tax) || tax < 0) {
      return NextResponse.json({ success: false, error: 'Tax must be 0 or more' }, { status: 400 })
    }
    const day = /^\d{4}-\d{2}-\d{2}$/
    if (!day.test(t(body.invoice_date).slice(0, 10)) || (body.due_date && !day.test(String(body.due_date).slice(0, 10)))) {
      return NextResponse.json({ success: false, error: 'Dates must be YYYY-MM-DD' }, { status: 400 })
    }
    // The agency's currency when none is given (it was always EUR).
    let currency = t(body.currency).toUpperCase()
    if (!currency) {
      const { data: tenantRow } = await supabase.from('tenants').select('default_currency').eq('id', tenant_id).maybeSingle()
      currency = (tenantRow as { default_currency?: string | null } | null)?.default_currency || 'EUR'
    }
    if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) {
      return NextResponse.json({ success: false, error: `Currency "${currency}" is not supported` }, { status: 400 })
    }

    // Internal reference generation goes through nextDocumentNumber (sequence-
    // first with year-scoped MAX fallback). The INSERT is wrapped in
    // insertWithUniqueRetry so a 23505 violation from the new UNIQUE constraint
    // regenerates the reference and retries.
    const baseSupplierInvoice = {
      tenant_id,
      supplier_invoice_number: t(body.supplier_invoice_number),
      supplier_name: t(body.supplier_name),
      supplier_id: body.supplier_id || null,
      invoice_date: body.invoice_date,
      due_date: body.due_date || null,
      amount,
      currency,
      tax_amount: tax,
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


