import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const { id, paymentId } = await params

    // Verify payment belongs to this invoice
    const { data: payment, error: fetchError } = await supabaseAdmin
      .from('invoice_payments')
      .select('*')
      .eq('id', paymentId)
      .eq('invoice_id', id)
      .single()

    if (fetchError || !payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    // Delete the payment
    const { error } = await supabaseAdmin
      .from('invoice_payments')
      .delete()
      .eq('id', paymentId)

    if (error) {
      console.error('Error deleting payment:', error)
      return NextResponse.json({ error: 'Failed to delete payment' }, { status: 500 })
    }

    // Manually update invoice since trigger might not fire on delete
    const { data: payments } = await supabaseAdmin
      .from('invoice_payments')
      .select('amount')
      .eq('invoice_id', id)

    const totalPaid = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0)

    const { data: invoice } = await supabaseAdmin
      .from('invoices')
      .select('total_amount')
      .eq('id', id)
      .single()

    if (invoice) {
      const balanceDue = Number(invoice.total_amount) - totalPaid
      let status = 'sent'
      if (totalPaid >= Number(invoice.total_amount)) {
        status = 'paid'
      } else if (totalPaid > 0) {
        status = 'partial'
      }

      await supabaseAdmin
        .from('invoices')
        .update({
          amount_paid: totalPaid,
          balance_due: balanceDue,
          status: status,
          paid_at: status === 'paid' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in payment DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}