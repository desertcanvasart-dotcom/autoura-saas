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
import { invoiceBalance, sumPayments } from '@/lib/invoices/invoice-balance'

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

    // Get invoice (RLS filters to tenant's invoices only)
    const { data: invoice } = await supabase
      .from('invoices')
      .select('total_amount, status, currency, paid_at')
      .eq('id', id)
      .single()

    if (invoice) {
      const balance = invoiceBalance({
        total: invoice.total_amount,
        paid: sumPayments(payments, invoice.currency),
        currency: invoice.currency,
        status: invoice.status,
        paidAt: invoice.paid_at,
      })
      await supabase
        .from('invoices')
        .update({ ...balance, updated_at: new Date().toISOString() })
        .eq('id', id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('❌ Error in payment DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
