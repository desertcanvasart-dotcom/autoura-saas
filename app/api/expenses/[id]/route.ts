// app/api/expenses/[id]/route.ts
// ============================================
// AUTOURA - SINGLE EXPENSE API
// ============================================
// Get/Update/Delete individual expense
// Multi-tenancy: RLS enforces tenant isolation
// Security: Requires authentication
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'

export async function GET(
  _request: NextRequest,
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
      'itinerary_id',
      'booking_id',
      'notes',
      'receipt_url',
      'payment_method',
      'payment_reference',
    ]
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const field of allowedFields) {
      if (body[field] !== undefined) updateData[field] = body[field]
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

    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)

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

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('❌ Error in expense DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
