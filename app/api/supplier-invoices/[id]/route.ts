// GET/PATCH/DELETE /api/supplier-invoices/[id]
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'
import { isMatchable } from '@/lib/supplier-invoices/match-state'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createAuthenticatedClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })

    const { data: invoice, error } = await supabase.from('supplier_invoices').select('*').eq('id', id).single()
    if (error || !invoice) return NextResponse.json({ success: false, error: 'Supplier invoice not found' }, { status: 404 })

    const { data: matched } = await supabase
      .from('supplier_invoice_expenses')
      .select('*, expense:expenses(*)')
      .eq('supplier_invoice_id', id)

    return NextResponse.json({ success: true, data: { ...invoice, matched_expenses: matched || [] } })
  } catch (e: any) {
    console.error('supplier-invoice GET error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase || !auth.tenant_id) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase } = auth
    const { id } = await params
    const body = await request.json()

    // Allowlist of writable fields. The prior denylist (spread body, destructure
    // a few keys out) let clients PATCH state-machine fields like `status`,
    // `approved_at`, `approved_by`, `paid_at`, `payment_method`, `payment_reference`,
    // `match_status`, `matched_amount` — bypassing the pay/approve/match routes
    // and their state guards. Allowlist enforces that only descriptive metadata
    // can move through this endpoint; status transitions go through the
    // dedicated routes that own them.
    // Named after the table's columns: 'invoice_number', 'subtotal' and
    // 'total_amount' are not supplier_invoices columns, so an edit naming them
    // failed. The amount is not editable here at all.
    const allowedFields = [
      'supplier_id',
      'supplier_name',
      'supplier_invoice_number',
      'invoice_date',
      'due_date',
      'currency',
      'tax_amount',
      'description',
      'notes',
      'document_url',
    ]
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const field of allowedFields) {
      if (body[field] !== undefined) updateData[field] = body[field]
    }

    // The currency is what was matched and approved: changing it afterwards
    // re-labels the money (documents audit, round 12).
    let guardStatus: string | null = null
    if ('currency' in updateData) {
      const { data: current } = await supabase
        .from('supplier_invoices').select('status, currency, matched_amount').eq('id', id).maybeSingle()
      if (!current) return NextResponse.json({ success: false, error: 'Supplier invoice not found' }, { status: 404 })
      const changes = String(updateData.currency || 'EUR').toUpperCase() !== String(current.currency || 'EUR').toUpperCase()
      if (changes) {
        if (!isMatchable(current.status)) {
          return NextResponse.json({ success: false, error: `Cannot change the currency of an invoice with status '${current.status}'` }, { status: 409 })
        }
        if (Number(current.matched_amount || 0) > 0) {
          return NextResponse.json({ success: false, error: 'Unmatch its expenses before changing the invoice currency' }, { status: 409 })
        }
        guardStatus = current.status
      }
    }

    let query = supabase
      .from('supplier_invoices')
      .update(updateData)
      .eq('id', id)
    // Approved or paid between the read and this write: refused, not applied.
    if (guardStatus) query = query.eq('status', guardStatus)
    const { data, error } = await query.select().single()

    if (error?.code === 'PGRST116' && guardStatus) {
      return NextResponse.json({ success: false, error: 'The invoice changed meanwhile — reload and try again' }, { status: 409 })
    }
    if (error) return NextResponse.json({ success: false, error: 'Failed to update' }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (e: any) {
    console.error('supplier-invoice PATCH error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { id } = await params
    const { error } = await auth.supabase.from('supplier_invoices').delete().eq('id', id)
    if (error) return NextResponse.json({ success: false, error: 'Failed to delete' }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('supplier-invoice DELETE error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
