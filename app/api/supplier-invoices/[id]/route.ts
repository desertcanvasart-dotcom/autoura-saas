// GET/PATCH/DELETE /api/supplier-invoices/[id]
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

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

    // Strip immutable / derived fields
    const { id: _i, tenant_id: _t, created_at, internal_reference, matched_expenses, ...updateData } = body
    const { data, error } = await supabase
      .from('supplier_invoices')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

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
