import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { gateRole } from '@/lib/api-role-gate'
import { writeOffBalance } from '@/lib/invoices/write-off'

// POST /api/invoices/[id]/write-off { reason? } — a cancelled trip keeps what
// the client paid and the rest of this invoice is written off
// (lib/invoices/write-off). Managers and above: it changes what is owed.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const roleGate = await gateRole('manage')
  if (roleGate) return roleGate
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 500) : null
    const supabase = await createAuthenticatedClient()

    const { data: inv, error: fetchError } = await supabase
      .from('invoices')
      .select('invoice_number, invoice_type, line_items, tax_rate, discount_amount, total_amount, amount_paid, currency, status, paid_at, notes')
      .eq('id', id)
      .maybeSingle()
    if (fetchError) return NextResponse.json({ success: false, error: 'Could not load the invoice' }, { status: 500 })
    if (!inv) return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 })

    const result = writeOffBalance(inv as never, reason)
    if (!result.ok) return NextResponse.json({ success: false, error: `${inv.invoice_number}: ${result.error}` }, { status: 409 })

    const { error } = await supabase.from('invoices').update(result.update as never).eq('id', id)
    if (error) {
      console.error('❌ Error writing off invoice balance:', error)
      return NextResponse.json({ success: false, error: `Could not write off ${inv.invoice_number}` }, { status: 500 })
    }
    return NextResponse.json({ success: true, written_off: result.written_off })
  } catch (error) {
    console.error('❌ Error in invoice write-off:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
