// app/api/expenses/[id]/route.ts
// ============================================
// AUTOURA - SINGLE EXPENSE API
// ============================================
// Get/Update/Delete individual expense
// Multi-tenancy: RLS enforces tenant isolation
// Security: Requires authentication
// ============================================

import { gateRole } from '@/lib/api-role-gate'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { EXPENSE_STATUSES, expenseStatusUpdate } from '@/lib/expense-status'
import { checkExpenseFields } from '@/lib/expenses/expense-fields'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Viewers read nothing here and change nothing; deletes and the
  // finance-only areas are for managers and admins (lib/api-role-gate).
  const roleGate = await gateRole('staff')
  if (roleGate) return roleGate

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
      .from('expenses')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('❌ Error fetching expense:', error)
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('❌ Error in expense GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Viewers read nothing here and change nothing; deletes and the
  // finance-only areas are for managers and admins (lib/api-role-gate).
  const roleGate = await gateRole('staff')
  if (roleGate) return roleGate

  try {
    const { id } = await params
    const body = await request.json()
    // Use authenticated client - RLS enforces tenant boundaries
    const supabase = await createAuthenticatedClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    // Allowlist of writable fields. The prior denylist pattern (spread body,
    // delete a few keys) let clients write fields like `paid_at`, `status`,
    // `approved_at`, `approved_by`, etc. — derived/state-machine fields that
    // must only move through the dedicated routes.
    const allowedFields = [
      'description',
      'category',
      'amount',
      'currency',
      'expense_date',
      'supplier_id',
      'supplier_name',
      'supplier_type',
      'itinerary_id',
      'booking_id',
      'notes',
      'receipt_url',
      'receipt_filename',
      'payment_method',
      'payment_reference',
    ]
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const field of allowedFields) {
      if (body[field] === undefined) continue
      // A blank form field is nothing, not '': an expense with no trip sent
      // itinerary_id '' and every edit of it failed on the uuid column.
      const v = typeof body[field] === 'string' ? body[field].trim() : body[field]
      updateData[field] = v === '' ? null : v
    }
    const bad = checkExpenseFields(updateData)
    if (bad) return NextResponse.json({ success: false, error: bad }, { status: 400 })

    // Status moves here too. It was left off the list above, so every
    // Approve / Mark as paid button (Expenses, Payables, the edit form) sent
    // a status that was silently dropped — and the expense never moved. The
    // payment date follows it: set on paid (today unless given), cleared
    // when the expense is no longer paid.
    if (body.status !== undefined) {
      // Approving, paying or rejecting a cost is a manager's call.
      if (['approved', 'paid', 'rejected'].includes(String(body.status))) {
        const managerGate = await gateRole('manage')
        if (managerGate) return managerGate
      }
      const status = expenseStatusUpdate(body.status, body.payment_date)
      if (!status) {
        return NextResponse.json({ success: false, error: `status must be one of: ${EXPENSE_STATUSES.join(', ')}` }, { status: 400 })
      }
      Object.assign(updateData, status)
    }

    // A picked supplier must be one of this agency's (RLS scopes the read).
    if (updateData.supplier_id) {
      const { data: supplier } = await supabase
        .from('suppliers')
        .select('id')
        .eq('id', updateData.supplier_id)
        .maybeSingle()
      if (!supplier) {
        return NextResponse.json({ success: false, error: 'Supplier not found or access denied' }, { status: 404 })
      }
    }

    const { data, error } = await supabase
      .from('expenses')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('❌ Error updating expense:', error)
      return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('❌ Error in expense PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Viewers read nothing here and change nothing; deletes and the
  // finance-only areas are for managers and admins (lib/api-role-gate).
  const roleGate = await gateRole('manage')
  if (roleGate) return roleGate

  try {
    const { id } = await params
    // Use authenticated client - RLS policies enforce tenant isolation + manager role
    const supabase = await createAuthenticatedClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { data: removed, error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)
      .select('id')

    if (error) {
      console.error('❌ Error deleting expense:', error)
      // RLS will return a generic error if permission denied
      if (error.code === 'PGRST116' || error.message.includes('permission')) {
        return NextResponse.json(
          { error: 'Expense not found or you do not have permission to delete it' },
          { status: 403 }
        )
      }
      return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 })
    }
    // Nothing deleted is not a success (it was reported as one).
    if (!removed || removed.length === 0) {
      return NextResponse.json({ error: 'Expense not found or you do not have permission to delete it' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('❌ Error in expense DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
