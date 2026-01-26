// app/api/invoices/[id]/route.ts
// ============================================
// AUTOURA - SINGLE INVOICE API
// ============================================
// Get/Update/Delete individual invoice
// Multi-tenancy: RLS enforces tenant isolation
// Security: Requires authentication
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Use authenticated client - RLS automatically filters by tenant
    const supabase = await createAuthenticatedClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('❌ Error fetching invoice:', error)
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('❌ Error in invoice GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    // Use authenticated client - RLS enforces tenant boundaries
    const supabase = await createAuthenticatedClient()

    // Build update object with only provided fields
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    // List of allowed fields to update
    const allowedFields = [
      'client_id', 'itinerary_id', 'client_name', 'client_email',
      'line_items', 'subtotal', 'tax_rate', 'tax_amount', 'discount_amount',
      'total_amount', 'currency', 'amount_paid', 'balance_due', 'status',
      'issue_date', 'due_date', 'notes', 'payment_terms', 'payment_instructions',
      'sent_at', 'paid_at'
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // If total_amount is updated, recalculate balance_due
    if (updateData.total_amount !== undefined) {
      const { data: currentInvoice } = await supabase
        .from('invoices')
        .select('amount_paid')
        .eq('id', id)
        .single()

      if (currentInvoice) {
        updateData.balance_due = updateData.total_amount - (currentInvoice.amount_paid || 0)
      }
    }

    const { data, error } = await supabase
      .from('invoices')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('❌ Error updating invoice:', error)
      return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('❌ Error in invoice PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Use authenticated client - RLS policies enforce tenant isolation + manager role
    const supabase = await createAuthenticatedClient()

    // First delete related payments (RLS will filter to tenant's payments only)
    await supabase
      .from('invoice_payments')
      .delete()
      .eq('invoice_id', id)

    // Then delete the invoice (RLS will filter to tenant's invoices only)
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('❌ Error deleting invoice:', error)
      // RLS will return a generic error if permission denied
      if (error.code === 'PGRST116' || error.message.includes('permission')) {
        return NextResponse.json(
          { error: 'Invoice not found or you do not have permission to delete it' },
          { status: 403 }
        )
      }
      return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('❌ Error in invoice DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
