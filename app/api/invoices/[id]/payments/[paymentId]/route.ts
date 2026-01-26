// app/api/invoices/[id]/payments/[paymentId]/route.ts
// ============================================
// AUTOURA - DELETE INVOICE PAYMENT API
// ============================================
// Delete a specific payment from an invoice
// Multi-tenancy: RLS enforces tenant isolation
// Security: Requires manager role (via RLS policy)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const { id, paymentId } = await params
    // Use authenticated client - RLS enforces tenant + manager role
    const supabase = await createAuthenticatedClient()

    // Verify payment belongs to this invoice and tenant (RLS filters automatically)
    const { data: payment, error: fetchError } = await supabase
      .from('invoice_payments')
      .select('*')
      .eq('id', paymentId)
      .eq('invoice_id', id)
      .single()

    if (fetchError || !payment) {
      return NextResponse.json({ error: 'Payment not found or access denied' }, { status: 404 })
    }

    // Delete the payment (RLS requires manager role)
    const { error } = await supabase
      .from('invoice_payments')
      .delete()
      .eq('id', paymentId)

    if (error) {
      console.error('❌ Error deleting payment:', error)
      // RLS will return error if not manager role
      if (error.code === 'PGRST116' || error.message.includes('permission')) {
        return NextResponse.json(
          { error: 'Payment not found or you do not have permission to delete it' },
          { status: 403 }
        )
      }
      return NextResponse.json({ error: 'Failed to delete payment' }, { status: 500 })
    }

    // Recalculate invoice balance after deletion
    // RLS filters to tenant's payments only
    const { data: payments } = await supabase
      .from('invoice_payments')
      .select('amount')
      .eq('invoice_id', id)

    const totalPaid = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0)

    // Get invoice (RLS filters to tenant's invoices only)
    const { data: invoice } = await supabase
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
        status = 'partially_paid'
      }

      await supabase
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
    console.error('❌ Error in payment DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
