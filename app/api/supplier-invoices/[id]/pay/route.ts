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

    // Conditional UPDATE: the .eq('status', 'approved') runs at the DB level
    // alongside the WHERE on id, so two concurrent pay calls can't both
    // succeed. The prior code did SELECT-then-UPDATE which let two requests
    // both pass the read-side check and both write paid_at, with the second
    // overwriting the first.
    const { data, error: uErr } = await supabase
      .from('supplier_invoices')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_method: body.payment_method || null,
        payment_reference: body.payment_reference || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'approved')
      .select()
      .maybeSingle()
    if (uErr) return NextResponse.json({ success: false, error: 'Failed to mark paid' }, { status: 500 })

    if (!data) {
      // Distinguish "not found" from "wrong state" so the caller knows
      // whether to retry, refresh, or surface an error.
      const { data: probe } = await supabase
        .from('supplier_invoices')
        .select('status')
        .eq('id', id)
        .maybeSingle()
      if (!probe) {
        return NextResponse.json({ success: false, error: 'Supplier invoice not found' }, { status: 404 })
      }
      return NextResponse.json(
        { success: false, error: `Invoice must be approved before it can be paid. Current status: ${probe.status}` },
        { status: 409 }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (e: any) {
    console.error('pay error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
