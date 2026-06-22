// POST /api/supplier-invoices/[id]/approve — requires fully matched (or override)
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase, user } = auth
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const override = body.override === true

    const { data: invoice, error } = await supabase
      .from('supplier_invoices').select('match_status, status').eq('id', id).single()
    if (error || !invoice) return NextResponse.json({ success: false, error: 'Supplier invoice not found' }, { status: 404 })

    if (invoice.status === 'paid' || invoice.status === 'cancelled') {
      return NextResponse.json({ success: false, error: `Cannot approve invoice with status: ${invoice.status}` }, { status: 400 })
    }
    if (invoice.match_status !== 'matched' && !override) {
      return NextResponse.json(
        { success: false, error: 'Invoice must be fully matched before approval. Pass override: true to approve with a discrepancy.' },
        { status: 400 }
      )
    }

    const { data, error: uErr } = await supabase
      .from('supplier_invoices')
      .update({ status: 'approved', approved_by: user.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id).select().single()
    if (uErr) return NextResponse.json({ success: false, error: 'Failed to approve' }, { status: 500 })

    return NextResponse.json({ success: true, data })
  } catch (e: any) {
    console.error('approve error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
