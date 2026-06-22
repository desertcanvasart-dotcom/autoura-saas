// POST /api/supplier-invoices/[id]/dispute
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
    const reason: string = body.reason || 'Disputed'

    const { data, error } = await supabase
      .from('supplier_invoices')
      .update({ status: 'disputed', discrepancy_notes: reason, updated_at: new Date().toISOString() })
      .eq('id', id).select().single()
    if (error) return NextResponse.json({ success: false, error: 'Failed to dispute' }, { status: 500 })

    return NextResponse.json({ success: true, data })
  } catch (e: any) {
    console.error('dispute error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
