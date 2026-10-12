// app/api/invoices/[id]/payments/[paymentId]/route.ts
// ============================================
// AUTOURA - DELETE INVOICE PAYMENT API
// ============================================
// Delete a specific payment from an invoice
// Multi-tenancy: RLS enforces tenant isolation
// Security: Requires manager role (via RLS policy)
// ============================================

import { gateRole } from '@/lib/api-role-gate'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { invoiceBalance, sumPayments } from '@/lib/invoices/invoice-balance'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  // Viewers read nothing here and change nothing; deletes and the
  // finance-only areas are for managers and admins (lib/api-role-gate).
  const roleGate = await gateRole('manage')
  if (roleGate) return roleGate

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
    const { data: removed, error } = await supabase
      .from('invoice_payments')
      .delete()
      .eq('id', paymentId)
      .select('id')

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
    if (!removed || removed.length === 0) {
      return NextResponse.json({ error: 'Payment not found or you do not have permission to delete it' }, { status: 404 })
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
      const { error: balanceError } = await supabase
        .from('invoices')
        .update({ ...balance, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (balanceError) {
        console.error('Invoice balance after payment delete:', balanceError)
        return NextResponse.json({ error: 'The payment was deleted, but the invoice balance could not be updated — reload and check it' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('❌ Error in payment DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
