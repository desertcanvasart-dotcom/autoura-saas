// POST /api/supplier-invoices/[id]/pay — requires approved status
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase } = auth
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const { data: invoice, error } = await supabase.from('supplier_invoices').select('status').eq('id', id).single()
    if (error || !invoice) return NextResponse.json({ success: false, error: 'Supplier invoice not found' }, { status: 404 })
    if (invoice.status !== 'approved') {
      return NextResponse.json({ success: false, error: 'Invoice must be approved before it can be paid.' }, { status: 400 })
    }

    const { data, error: uErr } = await supabase
      .from('supplier_invoices')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_method: body.payment_method || null,
        payment_reference: body.payment_reference || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id).select().single()
    if (uErr) return NextResponse.json({ success: false, error: 'Failed to mark paid' }, { status: 500 })

    return NextResponse.json({ success: true, data })
  } catch (e: any) {
    console.error('pay error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
