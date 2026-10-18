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

    // The invoice's paid amount, balance and status are recomputed by the
    // database as the row is deleted, under a lock (migration 436) — not
    // re-read and written here, where a payment recorded at the same moment
    // could be lost from the totals.

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('❌ Error in payment DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
